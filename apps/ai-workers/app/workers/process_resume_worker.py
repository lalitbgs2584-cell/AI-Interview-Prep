import json
import traceback
import uuid

from app.core.event_logger import log_worker_event
from app.core.redis_client import client
from app.core.token_budget import BudgetExceededError
from app.graph.graph_registry.graph_registry import GRAPH_REGISTRY


def _publish_resume_budget_exceeded(payload: dict) -> None:
    client.publish(
        "resume:processed",
        json.dumps(
            {
                "event_type": "budget_exceeded",
                "payload": {
                    "user_id": payload.get("user_id"),
                    "file_id": payload.get("file_id"),
                    "message": "Daily interview limit reached. Resets at midnight.",
                },
            }
        ),
    )


def _publish_worker_failure(job: dict, reason: str) -> None:
    payload = job.get("payload", {})
    client.publish(
        "worker:failed",
        json.dumps(
            {
                "jobId": job.get("id") or payload.get("interview_id") or payload.get("file_id") or "unknown",
                "queue": job.get("type", "jobs"),
                "userId": payload.get("user_id"),
                "interviewId": payload.get("interview_id"),
                "fileId": payload.get("file_id"),
                "reason": reason,
            }
        ),
    )

def start_worker():
    print("Worker started. Waiting for jobs...")

    while True:
        try:
            _, job_data = client.brpop("jobs")
            job = json.loads(job_data)

            graph_type = job.get("type")
            payload = job.get("payload", {})
            trace_id = job.get("meta", {}).get("traceId") or payload.get("trace_id") or str(uuid.uuid4())
            payload["trace_id"] = trace_id
            queue_name = job.get("type", "jobs")

            log_worker_event(
                trace_id=trace_id,
                service="ai-workers",
                stage=queue_name,
                event_type="job_started",
                user_id=payload.get("user_id"),
                interview_id=payload.get("interview_id"),
                file_id=payload.get("file_id"),
            )

            try:
                graph = GRAPH_REGISTRY.get(graph_type)

                if not graph:
                    raise Exception(f"Unknown graph type: {graph_type}")

                # Invoke graph using payload directly
                final_state = graph.invoke(payload)

                if final_state.get("error"):
                    raise Exception(final_state["error"])

                print("... Job completed successfully")
                log_worker_event(
                    trace_id=trace_id,
                    service="ai-workers",
                    stage=queue_name,
                    event_type="job_completed",
                    user_id=payload.get("user_id"),
                    interview_id=payload.get("interview_id"),
                    file_id=payload.get("file_id"),
                )

            except BudgetExceededError:
                print(" Job failed: daily token budget exceeded")
                job["error"] = "BUDGET_EXCEEDED"
                _publish_resume_budget_exceeded(payload)
                log_worker_event(
                    trace_id=trace_id,
                    service="ai-workers",
                    stage=queue_name,
                    event_type="budget_exceeded",
                    level="warning",
                    user_id=payload.get("user_id"),
                    interview_id=payload.get("interview_id"),
                    file_id=payload.get("file_id"),
                    payload={"error": "BUDGET_EXCEEDED"},
                )

            except Exception as e:
                if str(e) == "BUDGET_EXCEEDED":
                    print(" Job failed: daily token budget exceeded")
                    job["error"] = "BUDGET_EXCEEDED"
                    _publish_resume_budget_exceeded(payload)
                    log_worker_event(
                        trace_id=trace_id,
                        service="ai-workers",
                        stage=queue_name,
                        event_type="budget_exceeded",
                        level="warning",
                        user_id=payload.get("user_id"),
                        interview_id=payload.get("interview_id"),
                        file_id=payload.get("file_id"),
                        payload={"error": "BUDGET_EXCEEDED"},
                    )
                    continue

                print(f" Job failed: {e}")

                job["error"] = str(e)
                job["traceback"] = traceback.format_exc()
                log_worker_event(
                    trace_id=trace_id,
                    service="ai-workers",
                    stage=queue_name,
                    event_type="job_failed",
                    level="error",
                    user_id=payload.get("user_id"),
                    interview_id=payload.get("interview_id"),
                    file_id=payload.get("file_id"),
                    payload={"error": str(e)},
                )
                job["retries"] = job.get("retries", 0) + 1

                if job["retries"] <= 3:
                    print(f"Retrying job (attempt {job['retries']})...")
                    client.lpush("jobs", json.dumps(job))
                else:
                    print("Max retries reached. Moving to dead letter queue.")
                    client.lpush("jobs:failed", json.dumps(job))
                    _publish_worker_failure(job, str(e))

        except Exception as e:
            print(f"Worker loop error: {str(e)}")
