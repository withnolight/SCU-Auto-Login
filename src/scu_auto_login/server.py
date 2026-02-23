import base64
import io
import logging
import os
import random
import string
from typing import Tuple, Dict, Any

from flask import Flask, request, jsonify, Blueprint
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
import ddddocr

# ==========================================
# Configuration
# ==========================================
class Config:
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "t")
    CAPTCHA_LENGTH = 4
    VALID_CHARS = set(string.ascii_lowercase + string.digits)

# ==========================================
# Logging Setup
# ==========================================
def setup_logging(debug: bool = False) -> logging.Logger:
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    # Disable Werkzeug default request logging if not in debug mode
    if not debug:
        logging.getLogger("werkzeug").setLevel(logging.ERROR)
    return logging.getLogger(__name__)

logger = setup_logging(Config.DEBUG)

# ==========================================
# Services / Business Logic
# ==========================================
class OCRService:
    def __init__(self):
        logger.info("Initializing OCR Service...")
        self.ocr = ddddocr.DdddOcr(show_ad=False)
        self.ocr.set_ranges(4)

    def fix_captcha(self, raw: str) -> str:
        """修正验证码结果，确保为指定长度的小写字母+数字"""
        raw = raw.lower()
        filtered = ''.join(c for c in raw if c in Config.VALID_CHARS)

        if len(filtered) == Config.CAPTCHA_LENGTH:
            return filtered
        elif len(filtered) > Config.CAPTCHA_LENGTH:
            return filtered[-Config.CAPTCHA_LENGTH:]
        else:
            padding = ''.join(random.choices(string.ascii_lowercase, k=Config.CAPTCHA_LENGTH - len(filtered)))
            return padding + filtered

    def recognize(self, img_data: bytes) -> str:
        """识别图片数据并返回修正后的验证码"""
        raw_result = self.ocr.classification(img_data)
        result = self.fix_captcha(raw_result)
        logger.debug(f"OCR Raw: {raw_result} -> Fixed: {result}")
        return result

# Initialize service globally
ocr_service = OCRService()

# ==========================================
# API Routes (Blueprint)
# ==========================================
api_bp = Blueprint("api", __name__, url_prefix="/api")

@api_bp.route('/ocr', methods=['POST'])
def handle_captcha() -> Tuple[Dict[str, Any], int]:
    try:
        logger.info("Received OCR request.")
        data = request.get_json(silent=True)
        
        if not data or 'image' not in data:
            logger.warning("Request missing image data.")
            return jsonify({"error": "No image data provided", "status": "fail"}), 400

        img_str = data['image']
        if "," in img_str:
            img_str = img_str.split(",", 1)[1]

        try:
            img_data = base64.b64decode(img_str)
        except Exception as e:
            logger.warning(f"Base64 decode failed: {e}")
            return jsonify({"error": "Invalid base64 encoding", "status": "fail"}), 400

        try:
            img = Image.open(io.BytesIO(img_data))
            img.verify()
        except UnidentifiedImageError:
            logger.warning("Invalid or corrupted image data.")
            return jsonify({"error": "Invalid image data", "status": "fail"}), 400

        result = ocr_service.recognize(img_data)
        return jsonify({"code": result, "status": "success"}), 200

    except Exception as e:
        logger.error(f"Unexpected error during OCR processing: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "status": "fail"}), 500

# ==========================================
# Application Factory
# ==========================================
def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(api_bp)
    
    @app.route('/health', methods=['GET'])
    def health_check():
        """健康检查接口"""
        return jsonify({"status": "ok"}), 200
        
    return app

# ==========================================
# Entry Point
# ==========================================
if __name__ == '__main__':
    app = create_app()
    logger.info(f"Starting server on {Config.HOST}:{Config.PORT} (Debug: {Config.DEBUG})")
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
