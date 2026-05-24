from fastapi import APIRouter, Depends

from app.models import UnifiedAIChatRequest
from app.dependencies import get_router_service
from app.services.router import RouterService
from app.core.prompts import get_task_system_prompt

router = APIRouter()
VALID_TASKS = {"feedback", "interview", "presentation", "english", "social", "social_eq"}


def _extract_answer_and_usage(response):
    if isinstance(response, str):
        return response, None
    if isinstance(response, dict):
        answer = response.get("answer") or response.get("content") or response.get("text") or ""
        return answer, response.get("usage")

    choices = getattr(response, "choices", None)
    if choices:
        answer = choices[0].message.content
    else:
        answer = str(response)

    usage = getattr(response, "usage", None)
    if hasattr(usage, "model_dump"):
        usage = usage.model_dump()
    return answer, usage


async def _run_task_chat(
    req: UnifiedAIChatRequest,
    task: str | None,
    router_svc: RouterService = Depends(get_router_service),
):
    """
    Shared task evaluator.
    Sends transcribed speech or typed text + task prompt to the LLM.
    """
    messages = []
    resolved_task = task or req.task

    system_prompt = req.system_prompt or get_task_system_prompt(resolved_task)
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    # Append conversation history from request
    if req.history:
        for msg in req.history:
            messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": req.query})

    # Call router with task-based failover
    response, meta = await router_svc.chat_with_failover(
        messages=messages,
        user_id=req.user_id,
        model_override=req.model_override,
        task=resolved_task
    )

    answer, usage = _extract_answer_and_usage(response)

    return {
        "answer": answer,
        "metadata": meta,
        "usage": usage,
    }


@router.post("/unified")
async def unified_chat(
    req: UnifiedAIChatRequest,
    router_svc: RouterService = Depends(get_router_service),
):
    """
    Backward-compatible task endpoint.
    The request body decides which AI function to run via `task`.
    """
    return await _run_task_chat(req, req.task, router_svc)


@router.post("/{task}")
async def task_chat(
    task: str,
    req: UnifiedAIChatRequest,
    router_svc: RouterService = Depends(get_router_service),
):
    """
    Separated AI function endpoint.
    Supported tasks: feedback, interview, presentation, english.
    """
    if task not in VALID_TASKS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Unknown AI function: {task}")
    return await _run_task_chat(req, task, router_svc)
