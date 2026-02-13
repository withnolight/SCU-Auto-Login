from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
import random
import string
import logging
from PIL import Image
import ddddocr

ocr = ddddocr.DdddOcr(show_ad=False)
ocr.set_ranges(4)
app = Flask(__name__)
# 允许跨域请求
CORS(app)

VALID_CHARS = set(string.ascii_lowercase + string.digits)
CAPTCHA_LENGTH = 4

def fix_captcha(raw: str) -> str:
    """修正验证码结果，确保为4位小写字母+数字"""
    # 统一转小写
    raw = raw.lower()
    # 删去不可能出现的字符
    filtered = ''.join(c for c in raw if c in VALID_CHARS)

    if len(filtered) == CAPTCHA_LENGTH:
        return filtered
    elif len(filtered) > CAPTCHA_LENGTH:
        # 从最前方删去多余字符
        return filtered[len(filtered) - CAPTCHA_LENGTH:]
    else:
        # 在最前方补入随机小写字母
        padding = ''.join(random.choices(string.ascii_lowercase, k=CAPTCHA_LENGTH - len(filtered)))
        return padding + filtered

@app.route('/api/ocr', methods=['POST'])
def handle_captcha():
    try:
        print("收到请求，正在处理...", flush=True)
        # 获取 JSON 数据
        data = request.get_json(silent=True)
        if not data or 'image' not in data:
            return jsonify({"error": "No image data", "status": "fail"}), 400

        # 处理 Base64 字符串
        # 格式通常为: data:image/png;base64,iVBORw0KGgoAAA...
        img_str = data['image']
        if "," in img_str:
            img_str = img_str.split(",")[1]

        # 解码图片数据
        img_data = base64.b64decode(img_str)

        # 验证图片数据有效性
        img = Image.open(io.BytesIO(img_data))
        img.verify()  # 验证图片是否损坏

        # 直接使用原始解码后的字节数据进行 OCR 识别
        raw_result = ocr.classification(img_data)
        result = fix_captcha(raw_result)
        #print(f"原始识别: {raw_result} -> 修正结果: {result}")

        # 返回识别结果的 JSON
        return jsonify({"code": result, "status": "success"})

    except Exception as e:
        print(f"处理失败: {e}")
        return jsonify({"error": str(e), "status": "fail"}), 500

if __name__ == '__main__':
    # 禁用 Flask (Werkzeug) 的默认访问日志
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    # 或者完全禁用：log.disabled = True

    # 运行在本地 5000 端口
    app.run(host='0.0.0.0', port=5000, debug=True)