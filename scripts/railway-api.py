#!/usr/bin/env python3
"""Railway GraphQL helper using Chrome session cookies."""
import json
import sys
import urllib.request

import browser_cookie3


def cookies() -> str:
    cj = browser_cookie3.chrome()
    parts = [
        f"{c.name}={c.value}"
        for c in cj
        if "railway.com" in c.domain or "railway.app" in c.domain
    ]
    return "; ".join(parts)


def gql(query: str, variables: dict | None = None) -> dict:
    body = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://backboard.railway.com/graphql/v2",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Cookie": cookies()},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


if __name__ == "__main__":
    op = sys.argv[1] if len(sys.argv) > 1 else "workspace"
    if op == "workspace":
        ws = sys.argv[2]
        q = """
        query($id: String!) {
          workspace(workspaceId: $id) {
            id name
            projects { edges { node { id name } } }
          }
        }
        """
        print(json.dumps(gql(q, {"id": ws}), indent=2))
    elif op == "project":
        pid = sys.argv[2]
        q = """
        query($id: String!) {
          project(id: $id) {
            id name
            services { edges { node { id name } } }
            environments { edges { node { id name } } }
          }
        }
        """
        print(json.dumps(gql(q, {"id": pid}), indent=2))
    elif op == "mutate":
        print(json.dumps(gql(sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else None), indent=2))
