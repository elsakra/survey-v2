#!/usr/bin/env python3
import argparse
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List


NGROK_TOKEN_DEFAULT = "3AXWJo3EMDLnTTowu47RBqiY4hD_nNVZ2JP2spm8Tecaopj8"


def run(cmd: List[str], cwd: Path) -> None:
    print(f"\n$ {' '.join(shlex.quote(c) for c in cmd)}")
    subprocess.run(cmd, cwd=str(cwd), check=True)


def ensure_ngrok(install_if_missing: bool, token: str) -> None:
    ngrok_bin = shutil.which("ngrok")
    if not ngrok_bin and install_if_missing:
        if shutil.which("brew") is None:
            raise RuntimeError("ngrok missing and Homebrew is not installed.")
        run(["brew", "install", "ngrok/ngrok/ngrok"], Path.cwd())
        ngrok_bin = shutil.which("ngrok")

    if not ngrok_bin:
        raise RuntimeError(
            "ngrok is not installed. Install with: brew install ngrok/ngrok/ngrok"
        )

    run(["ngrok", "config", "add-authtoken", token], Path.cwd())


def write_env_if_missing(repo_dir: Path, token: str) -> None:
    env_path = repo_dir / ".env"
    if not env_path.exists():
        example = repo_dir / ".env.example"
        if example.exists():
            env_path.write_text(example.read_text(), encoding="utf-8")
        else:
            env_path.write_text("", encoding="utf-8")

    text = env_path.read_text(encoding="utf-8")
    if "NGROK_AUTHTOKEN=" not in text:
        text += f"\nNGROK_AUTHTOKEN={token}\n"
        env_path.write_text(text, encoding="utf-8")

def require_vapi_env(repo_dir: Path) -> None:
    env_path = repo_dir / ".env"
    text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    required = [
        "VAPI_PRIVATE_KEY",
        "OPENAI_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]
    missing = []
    for key in required:
        marker = f"{key}="
        if marker not in text:
            missing.append(key)
            continue
        # very light validation for blank values
        for line in text.splitlines():
            if line.startswith(marker) and line.split("=", 1)[1].strip():
                break
        else:
            missing.append(key)
    if missing:
        raise RuntimeError(
            "Missing required .env values for Vapi flow: " + ", ".join(missing)
        )
    if "VAPI_PHONE_NUMBER_ID=" not in text and "VAPI_FROM_NUMBER=" not in text:
        raise RuntimeError(
            "Missing outbound caller config: set VAPI_PHONE_NUMBER_ID or VAPI_FROM_NUMBER in .env"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="One-command local interview test runner."
    )
    parser.add_argument(
        "--to",
        default="+19018717753",
        help='E.164 target phone number (default: "+19018717753")',
    )
    parser.add_argument(
        "--pillars-file",
        default="./pillars.pe.diligence.short.json",
        help="Path to pillars JSON (default: PE due diligence employee interview)",
    )
    parser.add_argument(
        "--duration-sec",
        default="180",
        help="Interview duration in seconds (120-1800, default: 180)",
    )
    parser.add_argument(
        "--title",
        default=None,
        help='Optional campaign title (default behavior labels run as "PE Due Diligence Interview (Clozd Style)")',
    )
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Skip pnpm dependency installation",
    )
    parser.add_argument(
        "--skip-ngrok-install",
        action="store_true",
        help="Do not auto-install ngrok if missing",
    )
    parser.add_argument(
        "--ngrok-token",
        default=os.getenv("NGROK_AUTHTOKEN", NGROK_TOKEN_DEFAULT),
        help="ngrok authtoken to configure",
    )
    args = parser.parse_args()

    repo_dir = Path(__file__).resolve().parent

    try:
        ensure_ngrok(install_if_missing=not args.skip_ngrok_install, token=args.ngrok_token)
        write_env_if_missing(repo_dir, args.ngrok_token)
        require_vapi_env(repo_dir)

        if not args.skip_install:
            run(["pnpm", "i"], repo_dir)

        cmd = [
            "pnpm",
            "interview",
            "--to",
            args.to,
            "--pillars-file",
            args.pillars_file,
            "--duration-sec",
            str(args.duration_sec),
        ]
        effective_title = args.title or "PE Due Diligence Interview (Clozd Style)"
        cmd.extend(["--title", effective_title])
        run(cmd, repo_dir)
    except subprocess.CalledProcessError as exc:
        print(f"\nCommand failed with exit code {exc.returncode}", file=sys.stderr)
        return exc.returncode
    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
