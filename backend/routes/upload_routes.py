"""Food image upload (admin) and safe static serving of uploaded files."""
from flask import Blueprint, jsonify, request, current_app, send_from_directory
from services import image_service
from utils.auth import auth_required

bp = Blueprint("uploads", __name__)


@bp.post("/api/uploads/food-image")
@auth_required("ADMIN")
def upload_food_image():
    url = image_service.save_upload(request.files.get("image"), current_app.config)
    return jsonify(url=url), 201


@bp.get("/uploads/<path:filename>")
def serve_upload(filename):
    # send_from_directory rejects path traversal (../) and only serves files inside UPLOAD_DIR
    resp = send_from_directory(current_app.config["UPLOAD_DIR"], filename, max_age=3600)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp
