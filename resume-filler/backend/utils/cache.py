"""
缓存管理工具
管理简历数据的本地缓存和版本历史
"""
import os
import json
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import uuid


class CacheManager:
    """缓存管理器"""

    def __init__(self, max_versions: int = 5):
        """
        初始化缓存管理器

        Args:
            max_versions: 最大保留版本数，默认5个
        """
        self.cache_dir = Path.home() / ".resume-filler" / "cache"
        self.max_versions = max_versions

        # 确保缓存目录存在
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # 当前简历文件
        self.current_file = self.cache_dir / "current_resume.json"

        # 版本历史目录
        self.versions_dir = self.cache_dir / "versions"
        self.versions_dir.mkdir(exist_ok=True)

        # 文件缓存目录
        self.file_cache_dir = self.cache_dir / "file_cache"
        self.file_cache_dir.mkdir(exist_ok=True)

    def calculate_file_hash(self, content: bytes) -> str:
        """
        计算文件内容的SHA256哈希

        Args:
            content: 文件内容（字节）

        Returns:
            哈希值（前16位）
        """
        return hashlib.sha256(content).hexdigest()[:16]

    def save_file_cache(self, file_hash: str, resume_data: Dict[str, Any]) -> bool:
        """
        保存文件哈希与解析结果的映射

        Args:
            file_hash: 文件哈希值
            resume_data: 解析后的简历数据

        Returns:
            是否保存成功
        """
        try:
            cache_file = self.file_cache_dir / f"{file_hash}.json"
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(resume_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存文件缓存失败: {e}")
            return False

    def load_file_cache(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """
        根据文件哈希加载缓存

        Args:
            file_hash: 文件哈希值

        Returns:
            简历数据字典，如果不存在返回None
        """
        try:
            cache_file = self.file_cache_dir / f"{file_hash}.json"
            if not cache_file.exists():
                return None
            with open(cache_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载文件缓存失败: {e}")
            return None

    def save_current_ref(self, version_id: str) -> bool:
        """
        保存当前简历的引用（只存 version_id）

        Args:
            version_id: 版本ID

        Returns:
            是否保存成功
        """
        try:
            ref_data = {
                "version_id": version_id,
                "updated_at": datetime.now().isoformat()
            }
            with open(self.current_file, 'w', encoding='utf-8') as f:
                json.dump(ref_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存引用失败: {e}")
            return False

    def load_current_ref(self) -> Optional[str]:
        """
        加载当前简历的 version_id

        Returns:
            版本ID，如果不存在返回None
        """
        try:
            if not self.current_file.exists():
                return None
            with open(self.current_file, 'r', encoding='utf-8') as f:
                ref_data = json.load(f)
                return ref_data.get("version_id")
        except Exception as e:
            print(f"加载引用失败: {e}")
            return None

    def save_current(self, resume_data: Dict[str, Any]) -> bool:
        """
        保存当前简历数据（兼容旧代码，实际保存引用）

        Args:
            resume_data: 简历数据字典

        Returns:
            是否保存成功
        """
        # 如果数据中有 version_id，保存引用
        version_id = resume_data.get("version_id")
        if version_id:
            return self.save_current_ref(version_id)

        # 兼容：如果没有 version_id，返回 False
        print("保存失败：缺少 version_id")
        return False

    def load_current(self) -> Optional[Dict[str, Any]]:
        """
        加载当前简历的完整数据（通过引用）

        Returns:
            简历数据字典，如果不存在返回None
        """
        version_id = self.load_current_ref()
        if not version_id:
            return None
        return self.load_version(version_id)

    def delete_current(self) -> bool:
        """
        删除当前简历引用

        Returns:
            是否删除成功
        """
        try:
            if self.current_file.exists():
                self.current_file.unlink()
            return True

        except Exception as e:
            print(f"删除缓存失败: {e}")
            return False

    def repair_current_ref(self) -> bool:
        """
        修复 current_resume.json 文件格式
        如果文件包含完整数据而非引用，则迁移到版本文件

        Returns:
            是否修复成功
        """
        try:
            if not self.current_file.exists():
                return True

            with open(self.current_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 如果已有 version_id 且只有少量字段，说明格式正确
            if "version_id" in data and len(data) <= 3:
                return True

            # 文件包含完整数据，需要迁移
            print("检测到旧格式 current_resume.json，正在迁移...")

            # 保存为版本文件
            version_id = self.save_version(data, data.get("source_file", "migrated"))

            # 更新引用
            if version_id:
                self.save_current_ref(version_id)
                print(f"迁移完成，新版本 ID: {version_id}")
                return True

            return False
        except Exception as e:
            print(f"修复引用失败: {e}")
            return False

    def update_version(self, version_id: str, resume_data: Dict[str, Any]) -> bool:
        """
        更新指定版本

        Args:
            version_id: 版本ID
            resume_data: 简历数据字典

        Returns:
            是否更新成功
        """
        try:
            version_file = self.versions_dir / f"{version_id}.json"
            if not version_file.exists():
                print(f"版本文件不存在: {version_id}")
                return False

            # 先读取原有数据，保留 version_created_at
            with open(version_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)

            # 保留原有的创建时间
            if "version_created_at" in existing_data:
                resume_data["version_created_at"] = existing_data["version_created_at"]

            resume_data["version_id"] = version_id
            resume_data["updated_at"] = datetime.now().isoformat()

            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(resume_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"更新版本失败: {e}")
            return False

    def save_version(self, resume_data: Dict[str, Any], source_file: str = "") -> Optional[str]:
        """
        保存版本历史

        Args:
            resume_data: 简历数据字典
            source_file: 来源文件名

        Returns:
            版本ID，如果保存失败返回None
        """
        try:
            # 生成版本ID
            version_id = str(uuid.uuid4())[:8]
            timestamp = datetime.now().isoformat()

            # 添加版本信息
            resume_data["version_id"] = version_id
            resume_data["version_created_at"] = timestamp
            resume_data["source_file"] = source_file

            # 保存版本文件
            version_file = self.versions_dir / f"{version_id}.json"
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(resume_data, f, ensure_ascii=False, indent=2)

            # 清理旧版本
            self._cleanup_old_versions()

            return version_id

        except Exception as e:
            print(f"保存版本失败: {e}")
            return None

    def load_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        """
        加载指定版本的简历数据

        Args:
            version_id: 版本ID

        Returns:
            简历数据字典，如果不存在返回None
        """
        try:
            version_file = self.versions_dir / f"{version_id}.json"

            if not version_file.exists():
                return None

            with open(version_file, 'r', encoding='utf-8') as f:
                return json.load(f)

        except Exception as e:
            print(f"加载版本失败: {e}")
            return None

    def list_versions(self) -> List[Dict[str, Any]]:
        """
        获取所有版本列表

        Returns:
            版本信息列表，按时间倒序
        """
        versions = []

        try:
            for version_file in self.versions_dir.glob("*.json"):
                try:
                    with open(version_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    versions.append({
                        "version_id": data.get("version_id", version_file.stem),
                        "created_at": data.get("version_created_at", ""),
                        "updated_at": data.get("updated_at", ""),
                        "source_file": data.get("source_file", ""),
                        "name": data.get("name", ""),
                        "display_name": data.get("display_name", ""),
                        "job_intention": data.get("job_intention", "")
                    })

                except Exception:
                    continue

            # 按时间倒序排列
            versions.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        except Exception as e:
            print(f"获取版本列表失败: {e}")

        return versions

    def delete_version(self, version_id: str) -> bool:
        """
        删除指定版本，同时检查并清理引用

        Args:
            version_id: 版本ID

        Returns:
            是否删除成功
        """
        try:
            # 检查是否是当前引用的版本
            current_ref = self.load_current_ref()
            if current_ref == version_id:
                # 删除引用文件
                self.delete_current()

            version_file = self.versions_dir / f"{version_id}.json"

            if version_file.exists():
                version_file.unlink()

            return True

        except Exception as e:
            print(f"删除版本失败: {e}")
            return False

    def _cleanup_old_versions(self):
        """清理旧版本，保留最新的max_versions个"""
        try:
            # 获取所有版本文件
            version_files = list(self.versions_dir.glob("*.json"))

            # 如果版本数超过限制
            if len(version_files) > self.max_versions:
                # 按修改时间排序
                version_files.sort(key=lambda x: x.stat().st_mtime)

                # 删除最旧的版本
                for old_file in version_files[:-self.max_versions]:
                    old_file.unlink()
                    print(f"已删除旧版本: {old_file.stem}")

        except Exception as e:
            print(f"清理旧版本失败: {e}")


# 创建全局实例
cache = CacheManager(max_versions=5)
