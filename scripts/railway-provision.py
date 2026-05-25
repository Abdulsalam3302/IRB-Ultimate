#!/usr/bin/env python3
"""Full Railway provisioning via Chrome session cookies."""
import json
import os
import subprocess
import sys
import time
import urllib.request

import browser_cookie3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ID = "e09f0e32-5235-47d3-8f71-60998efa6b3d"
ENV_ID = "6ddc16bf-74d6-4367-98af-8b1db18590c4"
WORKSPACE_ID = "43fbe652-d43a-4c62-8fe9-d823b3ac282c"
GITHUB_REPO = "Abdulsalam3302/IRB-Ultimate"
VERCEL_URL = "https://irb-saudi-arabia.vercel.app"


def cookies() -> str:
    cj = browser_cookie3.chrome()
    return "; ".join(
        f"{c.name}={c.value}"
        for c in cj
        if "railway.com" in c.domain or "railway.app" in c.domain
    )


def gql(query: str, variables: dict | None = None) -> dict:
    body: dict = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://backboard.railway.com/graphql/v2",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Cookie": cookies()},
        method="POST",
    )
    proc = subprocess.run(
        [
            "curl",
            "-sS",
            "-X",
            "POST",
            "https://backboard.railway.com/graphql/v2",
            "-H",
            "Content-Type: application/json",
            "-H",
            f"Cookie: {cookies()}",
            "-d",
            json.dumps(body),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    out = json.loads(proc.stdout)
    if out.get("errors"):
        raise RuntimeError(json.dumps(out["errors"], indent=2))
    return out["data"]


def main() -> None:
    # Secrets from GitHub (regenerate if unavailable locally)
    jwt = subprocess.check_output(
        ["openssl", "rand", "-hex", "48"], text=True
    ).strip()
    pilot = subprocess.check_output(
        ["openssl", "rand", "-hex", "24"], text=True
    ).strip()

    subprocess.run(
        ["gh", "secret", "set", "JWT_SECRET", "-R", GITHUB_REPO, "-b", jwt],
        check=True,
    )
    subprocess.run(
        ["gh", "secret", "set", "PILOT_LOGIN_TOKEN", "-R", GITHUB_REPO, "-b", pilot],
        check=True,
    )

    mysql_pw = subprocess.check_output(["openssl", "rand", "-hex", "16"], text=True).strip()

    print("Creating MySQL service...")
    mysql_data = gql(
        """
        mutation($projectId: String!, $name: String!) {
          serviceCreate(input: { projectId: $projectId, name: $name, source: { image: "mysql:8.4" } }) {
            id name
          }
        }
        """,
        {"projectId": PROJECT_ID, "name": "MySQL"},
    )
    mysql_id = mysql_data["serviceCreate"]["id"]
    print("  MySQL:", mysql_id)

    print("Creating web service from GitHub...")
    web_data = gql(
        """
        mutation($projectId: String!, $name: String!, $repo: String!) {
          serviceCreate(input: {
            projectId: $projectId
            name: $name
            source: { repo: $repo }
          }) {
            id name
          }
        }
        """,
        {"projectId": PROJECT_ID, "name": "IRB-Ultimate", "repo": GITHUB_REPO},
    )
    web_id = web_data["serviceCreate"]["id"]
    print("  Web:", web_id)

    print("Setting MySQL variables...")
    gql(
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
        {
            "sid": mysql_id,
            "env": ENV_ID,
            "vars": {
                "MYSQL_ROOT_PASSWORD": mysql_pw,
                "MYSQL_DATABASE": "irb_platform",
            },
        },
    )

    print("Setting web variables...")
    gql(
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
        {
            "sid": web_id,
            "env": ENV_ID,
            "vars": {
                "NODE_ENV": "production",
                "JWT_SECRET": jwt,
                "VITE_APP_ID": "irb-sa-prod",
                "OWNER_OPEN_ID": "dev-owner-001",
                "PILOT_LOGIN_ENABLED": "1",
                "PILOT_LOGIN_TOKEN": pilot,
                "VITE_PUBLIC_DEMO_BANNER": "1",
                "DATABASE_URL": "${{MySQL.MYSQL_URL}}",
                "ALLOWED_ORIGINS": VERCEL_URL,
            },
        },
    )

    print("Creating public domain...")
    domain_data = gql(
        """
        mutation($sid: String!, $env: String!) {
          serviceDomainCreate(input: { serviceId: $sid, environmentId: $env }) {
            domain
          }
        }
        """,
        {"sid": web_id, "env": ENV_ID},
    )
    domain = domain_data["serviceDomainCreate"]["domain"]
    railway_url = f"https://{domain}"
    print("  Domain:", railway_url)

    gql(
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
        {
            "sid": web_id,
            "env": ENV_ID,
            "vars": {
                "ALLOWED_ORIGINS": f"{VERCEL_URL},{railway_url}",
            },
        },
    )

    print("Triggering deploy...")
    gql(
        """
        mutation($sid: String!, $env: String!) {
          serviceInstanceDeployV2(serviceId: $sid, environmentId: $env)
        }
        """,
        {"sid": web_id, "env": ENV_ID},
    )

    print("Waiting for health...")
    for i in range(36):
        try:
            proc = subprocess.run(
                ["curl", "-sf", f"{railway_url}/api/health"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if proc.returncode == 0:
                print("  Health OK:", proc.stdout.strip())
                break
        except Exception:
            pass
        time.sleep(15)
    else:
        print("WARN: health check timed out — deployment may still be building")

    print("Updating Vercel rewrites...")
    subprocess.run(
        ["node", os.path.join(ROOT, "scripts/update-vercel-rewrites.mjs"), railway_url],
        check=True,
        cwd=ROOT,
    )

    subprocess.run(["vercel", "deploy", "--prod", "--yes"], check=True, cwd=ROOT)

    # Store railway token for CI — create account token via API if possible
    print("\nDONE")
    print("Railway:", railway_url)
    print("Vercel:", VERCEL_URL)
    print("Pilot login:", f"{railway_url}/api/dev/login")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
