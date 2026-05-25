#!/usr/bin/env python3
"""Push production env vars to Railway web service via GraphQL API."""
import json
import os
import subprocess
import sys

PROJECT_ID = os.environ.get("RAILWAY_PROJECT_ID", "e09f0e32-5235-47d3-8f71-60998efa6b3d")
ENV_ID = os.environ.get("RAILWAY_ENVIRONMENT_ID", "6ddc16bf-74d6-4367-98af-8b1db18590c4")
WEB_SERVICE_ID = os.environ.get("RAILWAY_WEB_SERVICE_ID", "90e95f9b-3597-414e-868e-68952a4718bd")
VERCEL_URL = "https://irb-saudi-arabia.vercel.app"
RAILWAY_URL = "https://irb-ultimate-production.up.railway.app"


def gql(token: str, query: str, variables: dict) -> dict:
    body = json.dumps({"query": query, "variables": variables})
    proc = subprocess.run(
        [
            "curl", "-sS", "-X", "POST", "https://backboard.railway.com/graphql/v2",
            "-H", "Authorization: Bearer " + token,
            "-H", "Content-Type: application/json",
            "-d", body,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        sys.exit(1)
    out = json.loads(proc.stdout)
    if out.get("errors"):
        print(json.dumps(out["errors"], indent=2), file=sys.stderr)
        raise RuntimeError("GraphQL error")
    return out["data"]


def main() -> None:
    token = os.environ.get("RAILWAY_TOKEN", "").strip()
    if not token:
        print("RAILWAY_TOKEN required", file=sys.stderr)
        sys.exit(1)

    vars_payload = {
        "PUBLIC_SIGNIN_ENABLED": "1",
        "PUBLIC_APP_URL": VERCEL_URL,
        "OWNER_OPEN_ID": "email:owner@irb-ultimate.local",
        "DATABASE_POOL_MAX": "30",
        "ALLOWED_ORIGINS": f"{VERCEL_URL},{RAILWAY_URL}",
    }

    print("Updating Railway production variables...")
    gql(
        token,
        """
        mutation($sid: String!, $env: String!, $vars: EnvironmentVariables!) {
          variableCollectionUpsert(input: {
            serviceId: $sid
            environmentId: $env
            variables: $vars
            replace: false
          })
        }
        """,
        {"sid": WEB_SERVICE_ID, "env": ENV_ID, "vars": vars_payload},
    )

    print("Triggering redeploy...")
    gql(
        token,
        """
        mutation($sid: String!, $env: String!) {
          serviceInstanceDeployV2(serviceId: $sid, environmentId: $env)
        }
        """,
        {"sid": WEB_SERVICE_ID, "env": ENV_ID},
    )
    print("Done. Sign in at:", VERCEL_URL + "/api/sign-in")


if __name__ == "__main__":
    main()
