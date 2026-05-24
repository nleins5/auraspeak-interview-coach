from fastapi import Request
from app.services.router import RouterService


def get_router_service(request: Request) -> RouterService:
    return request.app.state.router_service
