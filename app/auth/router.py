import secrets
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.models.oauth_state import OAuthState
from app.auth.jwt_utils import create_access_token
from app.auth.dependencies import get_current_user
from app.integrations.github.oauth import exchange_code_for_token, fetch_github_user, revoke_github_token
from app.auth.token_encryption import encrypt_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/github")
async def github_login(db: AsyncSession = Depends(get_db)):
    """
    Step 1: Redirect user to GitHub OAuth.
    Saves a random state to DB to prevent CSRF.
    """
    state = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Clean up old states (older than 10 min)
    await db.execute(
        delete(OAuthState).where(OAuthState.expires_at < datetime.now(timezone.utc))
    )

    oauth_state = OAuthState(state=state, expires_at=expires_at)
    db.add(oauth_state)
    await db.commit()

    github_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&scope=repo,read:user,user:email,read:org"
        f"&state={state}"
    )
    return RedirectResponse(url=github_url)


@router.get("/github/callback")
async def github_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2: GitHub redirects here with code + state.
    Validates state → exchanges code → upserts User → sets JWT cookie.
    """
    # Validate state
    result = await db.execute(
        select(OAuthState).where(
            OAuthState.state == state,
            OAuthState.expires_at > datetime.now(timezone.utc),
        )
    )
    oauth_state = result.scalar_one_or_none()
    if not oauth_state:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    # Clean up used state
    await db.delete(oauth_state)

    # Exchange code for access token
    try:
        access_token = await exchange_code_for_token(code)
    except Exception as e:
        logger.error(f"GitHub token exchange failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to exchange GitHub code")

    # Fetch GitHub user profile
    try:
        gh_user = await fetch_github_user(access_token)
    except Exception as e:
        logger.error(f"GitHub user fetch failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to fetch GitHub user")

    github_id = gh_user["id"]
    github_username = gh_user["login"]

    # Upsert user
    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    if user:
        # Update existing user
        user.github_username = github_username
        user.github_access_token = encrypt_token(access_token)
        user.email = gh_user.get("email")
        user.avatar_url = gh_user.get("avatar_url")
        user.name = gh_user.get("name")
    else:
        # Create new user
        user = User(
            github_id=github_id,
            github_username=github_username,
            github_access_token=encrypt_token(access_token),
            email=gh_user.get("email"),
            avatar_url=gh_user.get("avatar_url"),
            name=gh_user.get("name"),
        )
        db.add(user)

    await db.flush()
    await db.refresh(user)
    await db.commit()

    # Create JWT and set httpOnly cookie
    jwt_token = create_access_token(user.id)

    response = RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard")
    is_production = settings.APP_ENV == "production"
    response.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        secure=is_production,
        samesite="none" if is_production else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    logger.info(f"User {github_username} logged in (id={user.id})")
    return response


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return {
        "id": current_user.id,
        "github_id": current_user.github_id,
        "github_username": current_user.github_username,
        "name": current_user.name,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "created_at": current_user.created_at,
    }


@router.get("/github/reconnect")
async def github_reconnect(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Revoke the stored GitHub OAuth token then redirect to a fresh GitHub
    authorization screen — forces GitHub to show the org-access grant UI.
    Call this when the user needs to grant access to a new organization.
    """
    try:
        from app.auth.token_encryption import decrypt_token
        access_token = decrypt_token(current_user.github_access_token)
        await revoke_github_token(access_token)
    except Exception as e:
        logger.warning(f"Token revocation failed (continuing): {e}")

    # Clear the JWT cookie
    is_production = settings.APP_ENV == "production"
    state = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    oauth_state = OAuthState(state=state, expires_at=expires_at)
    db.add(oauth_state)
    await db.commit()

    github_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&scope=repo,read:user,user:email,read:org"
        f"&state={state}"
    )
    redirect = RedirectResponse(url=github_url)
    redirect.delete_cookie(
        key="access_token",
        path="/",
        secure=is_production,
        samesite="none" if is_production else "lax",
        httponly=True,
    )
    return redirect


@router.post("/logout")
async def logout(response: Response):
    """Clear the auth cookie."""
    is_production = settings.APP_ENV == "production"
    response.delete_cookie(
        key="access_token",
        path="/",
        secure=is_production,
        samesite="none" if is_production else "lax",
        httponly=True,
    )
    return {"message": "Logged out"}
