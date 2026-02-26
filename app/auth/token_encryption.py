"""
Simple symmetric encryption for GitHub access tokens at rest.
Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from SECRET_KEY.
"""
import logging
import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY (must be 32 url-safe base64 bytes)."""
    key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def _is_plaintext_token(value: str) -> bool:
    """Check if a value looks like an unencrypted GitHub token."""
    return value.startswith(("ghp_", "gho_", "ghs_", "ghu_", "github_pat_"))


def encrypt_token(plaintext: str) -> str:
    """Encrypt a GitHub access token for storage."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """
    Decrypt a stored GitHub access token.
    Handles legacy plaintext tokens gracefully during migration:
    if decryption fails and the value looks like a raw GitHub token,
    return it as-is so existing users aren't locked out.
    """
    # Fast path: if it's clearly a plaintext GitHub token, return it directly
    if _is_plaintext_token(ciphertext):
        logger.warning("Found plaintext GitHub token — will be encrypted on next login")
        return ciphertext

    try:
        f = _get_fernet()
        return f.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        # Fallback for any other unencrypted token format
        logger.warning("Token decryption failed — treating as plaintext legacy token")
        return ciphertext
