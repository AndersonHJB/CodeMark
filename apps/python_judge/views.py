import json
from functools import wraps

from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from .models import JudgeProblem, JudgeSubmission, UserProblemState


MAX_CODE_BYTES = 200 * 1024
MAX_INPUT_BYTES = 64 * 1024
MAX_RESULT_ITEMS = 80


def _json_error(message, status=400):
    return JsonResponse({"ok": False, "message": message}, status=status, json_dumps_params={"ensure_ascii": False})


def _json_login_required(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _json_error("请先登录后再做题", status=401)
        return view_func(request, *args, **kwargs)

    return wrapped


def _json_payload(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except (TypeError, ValueError, UnicodeDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _safe_text(value, max_bytes):
    value = "" if value is None else str(value)
    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value
    return encoded[:max_bytes].decode("utf-8", errors="ignore")


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _published_problem(slug):
    if not slug:
        return None
    return JudgeProblem.objects.filter(slug=slug, is_published=True).first()


def _safe_json_for_template(payload):
    return (
        json.dumps(payload, ensure_ascii=False)
        .replace("<", "\\u003C")
        .replace(">", "\\u003E")
        .replace("&", "\\u0026")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def _state_payload(state):
    if not state:
        return {
            "code": "",
            "customInput": "",
            "marked": False,
            "status": UserProblemState.STATUS_TODO,
            "lastResult": {},
            "lastSubmittedAt": "",
            "updatedAt": "",
        }
    return {
        "code": state.current_code,
        "customInput": state.custom_input,
        "marked": state.marked,
        "status": state.status,
        "lastResult": {
            "status": state.last_verdict,
            "score": state.last_score,
        } if state.last_verdict else {},
        "lastSubmittedAt": state.last_submitted_at.isoformat() if state.last_submitted_at else "",
        "updatedAt": state.updated_at.isoformat() if state.updated_at else "",
    }


def _submission_payload(submission):
    return {
        "id": submission.id,
        "status": submission.status,
        "passedCount": submission.passed_count,
        "totalCount": submission.total_count,
        "runtimeMs": submission.runtime_ms,
        "createdAt": submission.created_at.isoformat(),
    }


def _test_case_payload(test_case, index):
    return {
        "id": test_case.id,
        "title": test_case.title or f"测试点 {index}",
        "stdin": test_case.stdin,
        "expectedStdout": test_case.expected_stdout,
        "isSample": test_case.is_sample,
        "isHidden": test_case.is_hidden,
    }


def _problem_payload(problem, state=None, submissions=None):
    tests = [
        _test_case_payload(test_case, index + 1)
        for index, test_case in enumerate(test_case for test_case in problem.test_cases.all() if test_case.is_active)
    ]
    sample_count = sum(1 for test_case in tests if test_case["isSample"])
    return {
        "id": problem.id,
        "title": problem.title,
        "slug": problem.slug,
        "summary": problem.summary,
        "statement": problem.statement,
        "inputDescription": problem.input_description,
        "outputDescription": problem.output_description,
        "constraints": problem.constraints,
        "starterCode": problem.starter_code,
        "difficulty": problem.difficulty,
        "difficultyLabel": problem.get_difficulty_display(),
        "tags": problem.tags,
        "timeLimitMs": problem.time_limit_ms,
        "testCount": len(tests),
        "sampleCount": sample_count,
        "tests": tests,
        "state": _state_payload(state),
        "submissions": [_submission_payload(submission) for submission in (submissions or [])],
    }


def _bootstrap_payload(user):
    problems = list(
        JudgeProblem.objects.filter(is_published=True)
        .prefetch_related("test_cases")
        .order_by("sort_order", "id")
    )
    state_by_problem_id = {}
    submissions_by_problem_id = {}
    if user.is_authenticated and problems:
        problem_ids = [problem.id for problem in problems]
        states = UserProblemState.objects.filter(user=user, problem_id__in=problem_ids)
        state_by_problem_id = {state.problem_id: state for state in states}
        for problem in problems:
            submissions_by_problem_id[problem.id] = list(
                JudgeSubmission.objects.filter(user=user, problem=problem).order_by("-created_at")[:6]
            )

    serialized_problems = [
        _problem_payload(
            problem,
            state=state_by_problem_id.get(problem.id),
            submissions=submissions_by_problem_id.get(problem.id, []),
        )
        for problem in problems
    ]
    accepted_count = sum(
        1
        for problem in problems
        if state_by_problem_id.get(problem.id)
        and state_by_problem_id[problem.id].status == UserProblemState.STATUS_ACCEPTED
    )
    attempted_count = sum(
        1
        for problem in problems
        if state_by_problem_id.get(problem.id)
        and state_by_problem_id[problem.id].status in {
            UserProblemState.STATUS_ATTEMPTED,
            UserProblemState.STATUS_ACCEPTED,
        }
    )
    marked_count = sum(1 for state in state_by_problem_id.values() if state.marked)

    return {
        "isAuthenticated": bool(user.is_authenticated),
        "problems": serialized_problems,
        "activeSlug": serialized_problems[0]["slug"] if serialized_problems else "",
        "stats": {
            "total": len(serialized_problems),
            "accepted": accepted_count,
            "attempted": attempted_count,
            "marked": marked_count,
        },
    }


@ensure_csrf_cookie
def workspace(request):
    bootstrap = _bootstrap_payload(request.user)
    return render(
        request,
        "python_judge/workspace.html",
        {
            "active_nav": "python_judge",
            "show_search": False,
            "show_account": True,
            "bootstrap_json": _safe_json_for_template(bootstrap),
        },
    )


@require_POST
@_json_login_required
def save_progress(request):
    payload = _json_payload(request)
    problem = _published_problem(payload.get("problem_slug"))
    if problem is None:
        return _json_error("题目不存在或尚未发布", status=404)
    state, _ = UserProblemState.objects.get_or_create(user=request.user, problem=problem)
    state.mark_started()

    if "code" in payload:
        state.current_code = _safe_text(payload.get("code"), MAX_CODE_BYTES)
    if "custom_input" in payload:
        state.custom_input = _safe_text(payload.get("custom_input"), MAX_INPUT_BYTES)
    if "marked" in payload:
        state.marked = bool(payload.get("marked"))
    if payload.get("status") in {
        UserProblemState.STATUS_TODO,
        UserProblemState.STATUS_ATTEMPTED,
        UserProblemState.STATUS_ACCEPTED,
    }:
        next_status = payload.get("status")
        if state.status != UserProblemState.STATUS_ACCEPTED or next_status == UserProblemState.STATUS_ACCEPTED:
            state.status = next_status
    if isinstance(payload.get("last_result"), dict):
        last_result = payload["last_result"]
        state.last_verdict = _safe_text(last_result.get("status", ""), 40)
        state.last_score = max(0, min(_safe_int(last_result.get("score"), state.last_score), 100))
        state.last_run_at = timezone.now()

    state.save()
    return JsonResponse({"ok": True, "state": _state_payload(state)}, json_dumps_params={"ensure_ascii": False})


@require_POST
@_json_login_required
def submit_solution(request):
    payload = _json_payload(request)
    problem = _published_problem(payload.get("problem_slug"))
    if problem is None:
        return _json_error("题目不存在或尚未发布", status=404)
    code = _safe_text(payload.get("code"), MAX_CODE_BYTES)
    results = payload.get("results")
    if not isinstance(results, list):
        results = []
    results = results[:MAX_RESULT_ITEMS]

    total_count = max(0, _safe_int(payload.get("total_count"), len(results)))
    passed_count = max(0, min(_safe_int(payload.get("passed_count"), 0), total_count))
    runtime_ms = max(0, _safe_int(payload.get("runtime_ms"), 0))
    requested_status = payload.get("status")
    if requested_status == JudgeSubmission.STATUS_ACCEPTED and total_count and passed_count == total_count:
        submission_status = JudgeSubmission.STATUS_ACCEPTED
    elif requested_status == "error":
        submission_status = JudgeSubmission.STATUS_RUNTIME_ERROR
    else:
        submission_status = JudgeSubmission.STATUS_WRONG_ANSWER
    score = 100 if submission_status == JudgeSubmission.STATUS_ACCEPTED else (
        int((passed_count / total_count) * 100) if total_count else 0
    )

    submission = JudgeSubmission.objects.create(
        user=request.user,
        problem=problem,
        code=code,
        status=submission_status,
        score=score,
        passed_count=passed_count,
        total_count=total_count,
        runtime_ms=runtime_ms,
        case_results=json.dumps(results, ensure_ascii=False),
        stdout="",
        stderr="",
    )

    state, _ = UserProblemState.objects.get_or_create(user=request.user, problem=problem)
    state.mark_started()
    state.current_code = code
    if submission_status == JudgeSubmission.STATUS_ACCEPTED or state.status != UserProblemState.STATUS_ACCEPTED:
        state.status = (
            UserProblemState.STATUS_ACCEPTED
            if submission_status == JudgeSubmission.STATUS_ACCEPTED
            else UserProblemState.STATUS_ATTEMPTED
        )
    state.last_verdict = submission_status
    state.last_score = score
    state.last_run_at = timezone.now()
    state.last_submitted_at = timezone.now()
    state.submission_count += 1
    state.save()

    return JsonResponse(
        {
            "ok": True,
            "submission": _submission_payload(submission),
            "state": _state_payload(state),
        },
        json_dumps_params={"ensure_ascii": False},
    )
