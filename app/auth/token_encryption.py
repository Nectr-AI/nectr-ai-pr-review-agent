"""
Simple symmetric encryption for GitHub access tokens at rest.
Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from SECRET_KEY.
"""
import base64
import hashlib
from cryptography.fernet import Fernet
from app.core.config import settings


def _get_fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY (must be 32 url-safe base64 bytes)."""
    # Hash the SECRET_KEY to get exactly 32 bytes, then base64-encode for Fernet
    key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a GitHub access token for storage."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a stored GitHub access token."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
