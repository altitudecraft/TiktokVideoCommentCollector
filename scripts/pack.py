#!/usr/bin/env python3
"""
TikTok Comment Exporter - 扩展打包脚本
用法: python scripts/pack.py
输出: dist/TikTok_Comment_Exporter_v{version}.zip
"""
import json
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

# 需要打包的文件和目录
INCLUDE = [
    'manifest.json',
    'icons/',
    'src/',
]

# 排除的文件模式
EXCLUDE_PATTERNS = [
    '.jpg',       # 原始图标源文件
    '__pycache__',
    '.DS_Store',
    'Thumbs.db',
]


def should_exclude(path_str):
    for pattern in EXCLUDE_PATTERNS:
        if pattern in path_str:
            return True
    return False


def main():
    # 读取版本号
    manifest_path = ROOT / 'manifest.json'
    if not manifest_path.exists():
        print('Error: manifest.json not found')
        sys.exit(1)

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    version = manifest.get('version', '0.0.0')

    # 创建 dist 目录
    DIST.mkdir(exist_ok=True)

    # 输出文件名
    zip_name = f'TikTok_Comment_Exporter_v{version}.zip'
    zip_path = DIST / zip_name

    # 打包
    file_count = 0
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for include in INCLUDE:
            full_path = ROOT / include
            if full_path.is_file():
                if not should_exclude(str(full_path)):
                    zf.write(full_path, include)
                    file_count += 1
            elif full_path.is_dir():
                for file in sorted(full_path.rglob('*')):
                    if file.is_file() and not should_exclude(str(file)):
                        arcname = str(file.relative_to(ROOT)).replace('\\', '/')
                        zf.write(file, arcname)
                        file_count += 1

    size_kb = zip_path.stat().st_size / 1024
    print(f'Packed {file_count} files -> {zip_path}')
    print(f'Size: {size_kb:.1f} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
