"""Local mock RGS for development and QA. Not part of the submission.

Serves the static build and a minimal Stake Engine wallet API backed by REAL books extracted from the
math (dev/books/<mode>.jsonl, see math/extract_books.py). The sample is drawn with the LUT weights, so
play is representative. Outcomes are always a published book; the frontend never decides anything.

  python3 scripts/mock_rgs.py [--port 8080] [--build build] [--balance 10000] [--currency USD]

Open  http://localhost:8080/?sessionID=dev&rgs_url=http://localhost:8080&currency=USD
Replay http://localhost:8080/?replay=true&game=constrictor&version=1&mode=base&event=<id>&rgs_url=http://localhost:8080

Dev-only endpoints (QA scripts):
  POST /dev/force   {"mode": "base", "category": "maxWin"}  or {"mode": "hunt", "id": 123}: next play uses it
  POST /dev/state   {"balance": 1000000000, "activeRound": true|false}
  GET  /dev/showcase
Special session ids: "err_is" -> ERR_IS on every call, "err_ipb" -> ERR_IPB on play.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, ".."))
BOOKS_DIR = os.path.join(APP, "dev", "books")
MATH_CFG = os.path.join(APP, "src", "game", "generated", "mathConfig.json")

API = 1_000_000
# Typical Stake USD ladder (raw units); every level is a multiple of stepBet.
BET_LEVELS = [int(x * API) for x in (0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000)]


class World:
    def __init__(self, balance: float, currency: str):
        with open(MATH_CFG, encoding="UTF-8") as f:
            self.costs = {m["id"]: m["cost"] for m in json.load(f)["modes"]}
        self.books: dict[str, dict[int, dict]] = {}
        self.sample: dict[str, list[int]] = {}
        self.showcase: dict[str, dict[str, list[int]]] = {}
        idx_path = os.path.join(BOOKS_DIR, "showcase.json")
        index = json.load(open(idx_path, encoding="UTF-8")) if os.path.exists(idx_path) else {}
        for mode in self.costs:
            path = os.path.join(BOOKS_DIR, f"{mode}.jsonl")
            if not os.path.exists(path):
                continue
            with open(path, encoding="UTF-8") as f:
                self.books[mode] = {b["id"]: b for b in map(json.loads, f)}
            ids = [i for i in index.get(mode, {}).get("sample", []) if i in self.books[mode]]
            self.sample[mode] = ids or sorted(self.books[mode])
            self.showcase[mode] = index.get(mode, {}).get("showcase", {})
        self.balance = int(balance * API)
        self.currency = currency
        self.active: dict | None = None
        self.forced: tuple[str, int] | None = None
        self.rng = random.Random()

    def pick(self, mode: str) -> dict:
        if self.forced and self.forced[0] == mode and self.forced[1] in self.books[mode]:
            bid = self.forced[1]
            self.forced = None
            return self.books[mode][bid]
        return self.books[mode][self.rng.choice(self.sample[mode])]


def err(code: str, status=400):
    return status, {"error": code, "message": code}


class Handler(SimpleHTTPRequestHandler):
    world: World
    build_dir: str

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=self.build_dir, **kw)

    def log_message(self, fmt, *args):  # quiet
        pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _json(self, status: int, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_GET(self):
        path = urlparse(self.path).path
        w = self.world
        if path.startswith("/bet/replay/"):
            parts = [unquote(p) for p in path.split("/")[3:]]
            if len(parts) != 4:
                return self._json(*err("ERR_VAL"))
            _game, _version, mode, event = parts
            try:
                book = w.books[mode][int(event)]
            except (KeyError, ValueError):
                return self._json(*err("ERR_VAL", 404))
            return self._json(200, {"payoutMultiplier": book["payoutMultiplier"] / 100, "costMultiplier": w.costs[mode], "state": book["events"]})
        if path == "/dev/showcase":
            return self._json(200, w.showcase)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        b = self._body()
        w = self.world
        sid = b.get("sessionID", "")
        if path.startswith("/wallet/") and sid == "err_is":
            return self._json(*err("ERR_IS"))
        if path == "/wallet/authenticate":
            rnd = None
            if w.active:
                rnd = {**w.active, "active": True}
            return self._json(200, {
                "balance": {"amount": w.balance, "currency": w.currency},
                "round": rnd,
                "config": {
                    "gameID": "constrictor",
                    "minBet": BET_LEVELS[0],
                    "maxBet": BET_LEVELS[-1],
                    "stepBet": 10_000,
                    "defaultBetLevel": API,
                    "betLevels": BET_LEVELS,
                    "jurisdiction": {},
                },
            })
        if path == "/wallet/play":
            mode = b.get("mode", "base")
            amount = b.get("amount")
            if mode not in w.books or not isinstance(amount, int) or amount not in BET_LEVELS:
                return self._json(*err("ERR_VAL"))
            if w.active:
                return self._json(*err("ERR_VAL"))
            cost = round(amount * w.costs[mode])
            if sid == "err_ipb" or cost > w.balance:
                return self._json(*err("ERR_IPB"))
            w.balance -= cost
            book = w.pick(mode)
            rnd = {
                "betID": book["id"],
                "amount": amount,
                "payout": amount * book["payoutMultiplier"] // 100,
                "payoutMultiplier": book["payoutMultiplier"] / 100,
                "costMultiplier": w.costs[mode],
                "active": book["payoutMultiplier"] > 0,
                "mode": mode,
                "event": str(book["id"]),
                "state": book["events"],
            }
            if rnd["active"]:
                w.active = rnd
            return self._json(200, {"balance": {"amount": w.balance, "currency": w.currency}, "round": rnd})
        if path == "/wallet/end-round":
            if w.active:
                w.balance += w.active["payout"]
                w.active = None
            return self._json(200, {"balance": {"amount": w.balance, "currency": w.currency}})
        if path == "/wallet/balance":
            return self._json(200, {"balance": {"amount": w.balance, "currency": w.currency}})
        if path == "/bet/event":
            return self._json(200, {"event": b.get("event", "")})
        if path == "/dev/force":
            mode = b.get("mode", "base")
            bid = b.get("id")
            if bid is None:
                ids = w.showcase.get(mode, {}).get(b.get("category", ""), [])
                bid = w.rng.choice(ids) if ids else None
            if bid is None or mode not in w.books or int(bid) not in w.books[mode]:
                return self._json(*err("ERR_VAL", 404))
            w.forced = (mode, int(bid))
            return self._json(200, {"forced": [mode, int(bid)]})
        if path == "/dev/state":
            if "balance" in b:
                w.balance = int(b["balance"])
            if b.get("activeRound") is False:
                w.active = None
            if "currency" in b:
                w.currency = b["currency"]
            return self._json(200, {"balance": w.balance, "active": bool(w.active)})
        return self._json(*err("ERR_VAL", 404))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--build", default=os.path.join(APP, "build"))
    ap.add_argument("--balance", type=float, default=10_000)
    ap.add_argument("--currency", default="USD")
    a = ap.parse_args()
    Handler.world = World(a.balance, a.currency)
    Handler.build_dir = a.build
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"mock RGS on http://localhost:{a.port} (modes: {', '.join(Handler.world.books)})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
