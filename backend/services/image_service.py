"""Food images: safe uploads, default dish photos and cleanup.

Images live as files in backend/uploads/foods/ and are served by Flask at /uploads/foods/<file>.
MongoDB stores only the reference (food_items.image_url), never the binary data.
"""
import os, threading, uuid, logging
from db import get_db

log = logging.getLogger(__name__)
FOODS_SUBDIR = "foods"
ALLOWED = {"jpg": b"\xff\xd8\xff", "jpeg": b"\xff\xd8\xff", "png": b"\x89PNG", "webp": b"RIFF", "gif": b"GIF8"}
COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/{}?width=800"

# Default photo for each seeded dish. Five ship with the project; the rest are freely licensed
# Wikimedia Commons photos downloaded on first start (see README "Image credits").
DEFAULT_IMAGES = {
    "Masala Dosa": ("masala_dosa.jpg", None),
    "Chicken Biryani": ("chicken_biryani.jpg", None),
    "Veg Fried Rice": ("veg_fried_rice.jpg", None),
    "Paneer Butter Masala": ("paneer_butter_masala.jpg", None),
    "Cold Coffee": ("cold_coffee.jpg", None),
    "Idli Vada": ("idli_vada.jpg", "Idly_sambar_vada.JPG"),
    "Poha": ("poha.jpg", "Kanda_poha.jpg"),
    "Veg Biryani": ("veg_biryani.jpg", "Veg_Kaju_Biryani.jpg"),
    "South Indian Thali": ("south_indian_thali.jpg", "A_Thali,_famous_South_Indian_meal_served_on_a_banana_leaf.jpg"),
    "Chapati Kurma": ("chapati_kurma.jpg", "Chapati2.JPG"),
    "Samosa": ("samosa.jpg", "Indian_Samosa_by_clumsy_home_chef.jpg"),
    "Veg Puff": ("veg_puff.jpg", "Bite_of_Curry_Puff.jpg"),
    "Egg Puff": ("egg_puff.jpg", "Egg_Puffs.jpg"),
    "Chicken Roll": ("chicken_roll.jpg", "Chicken_Egg_Roll.JPG"),
    "Masala Tea": ("masala_tea.jpg", "Masala_Chai.JPG"),
    "Fresh Lime Juice": ("fresh_lime_juice.jpg", "Nimbu_pani.JPG"),
}


def upload_dir(cfg):
    path = os.path.join(cfg["UPLOAD_DIR"], FOODS_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def local_url(filename):
    return f"/uploads/{FOODS_SUBDIR}/{filename}"


def default_image(name, cfg):
    """image_url + source page for a seeded dish (local file if present, else the Commons URL)."""
    if name not in DEFAULT_IMAGES:
        return "", None
    fname, commons = DEFAULT_IMAGES[name]
    source = f"https://commons.wikimedia.org/wiki/File:{commons}" if commons else None
    if os.path.exists(os.path.join(upload_dir(cfg), fname)) or not commons:
        return local_url(fname), source
    return COMMONS.format(commons), source


def save_upload(file, cfg):
    """Validate extension + file signature, store under a random name, return the public URL."""
    from utils.helpers import ApiError
    if not file or not file.filename:
        raise ApiError("Choose an image file")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED:
        raise ApiError("Only JPG, PNG, WEBP or GIF images are allowed")
    head = file.stream.read(12)
    file.stream.seek(0)
    if not head.startswith(ALLOWED[ext]) or (ext == "webp" and head[8:12] != b"WEBP"):
        raise ApiError("The file is not a valid image")
    name = f"{uuid.uuid4().hex}.{'jpg' if ext == 'jpeg' else ext}"
    file.save(os.path.join(upload_dir(cfg), name))
    return local_url(name)


def delete_if_unused(url, cfg):
    """Remove an uploaded file once no food item references it (default dish photos are kept)."""
    if not url or not url.startswith(f"/uploads/{FOODS_SUBDIR}/"):
        return
    fname = os.path.basename(url)
    if fname in {v[0] for v in DEFAULT_IMAGES.values()}:
        return
    if get_db().food_items.count_documents({"image_url": url}) == 0:
        try:
            os.remove(os.path.join(upload_dir(cfg), fname))
        except OSError:
            pass


def migrate_image_urls(cfg):
    """Older builds served images from the React app (/images/x.jpg). Point them at Flask instead,
    and give dishes that have no image their default photo."""
    db = get_db()
    for f in db.food_items.find({}, {"name": 1, "image_url": 1}):
        url = f.get("image_url") or ""
        if url.startswith("/images/"):
            db.food_items.update_one({"_id": f["_id"]}, {"$set": {"image_url": local_url(os.path.basename(url))}})
        elif not url:
            new, source = default_image(f["name"], cfg)
            if new:
                db.food_items.update_one({"_id": f["_id"]}, {"$set": {"image_url": new, "image_source": source}})


def fetch_default_images(cfg):
    """Download Commons photos referenced by URL into uploads/foods and switch the DB to the local copy."""
    try:
        import requests
    except ImportError:
        return
    db, folder = get_db(), upload_dir(cfg)
    for name, (fname, commons) in DEFAULT_IMAGES.items():
        if not commons:
            continue
        remote = COMMONS.format(commons)
        target = os.path.join(folder, fname)
        if not os.path.exists(target):
            try:
                r = requests.get(remote, timeout=15, headers={"User-Agent": "CanteenX-SMT/1.0 (college project)"})
                if r.ok and r.headers.get("content-type", "").startswith("image/"):
                    with open(target, "wb") as fh:
                        fh.write(r.content)
                    log.info("Downloaded image for %s", name)
                else:
                    log.warning("Could not download image for %s (HTTP %s)", name, r.status_code)
            except Exception as e:  # offline etc. – the remote URL / fallback placeholder still works
                log.warning("Could not download image for %s: %s", name, e)
        if os.path.exists(target):
            db.food_items.update_many({"image_url": remote}, {"$set": {"image_url": local_url(fname)}})


def start_background_fetch(cfg):
    if not cfg.get("FETCH_FOOD_IMAGES", True) or cfg.get("TESTING"):
        return
    threading.Thread(target=fetch_default_images, args=(cfg,), daemon=True).start()
