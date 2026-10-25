"""AutoViral Shorts launcher: starts API + worker on 127.0.0.1 by default."""
import os
import sys

import uvicorn


def main() -> None:
    host = os.environ.get("AUTOVIRAL_HOST", "127.0.0.1")
    port = int(os.environ.get("AUTOVIRAL_PORT", "8420"))
    if host != "127.0.0.1" and not os.environ.get("AUTOVIRAL_ACCESS_TOKEN"):
        print("REFUSING to bind a non-local address without AUTOVIRAL_ACCESS_TOKEN set.\n"
              "This app has no login; do not expose it publicly unprotected.")
        sys.exit(2)
    uvicorn.run("backend.main:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
