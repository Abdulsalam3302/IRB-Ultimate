"""Local fake-TCP readiness tests; no Docker daemon, signature download or files scanned."""
import datetime
import os
from pathlib import Path
import shutil
import socketserver
import subprocess
import tempfile
import threading
import time
import unittest

HERE = Path(__file__).resolve().parent


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class HealthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tools = tempfile.TemporaryDirectory(prefix="irb-scanner-health-")
        # The image has GNU coreutils; macOS local tests use installed GNU date.
        date = shutil.which("gdate") or shutil.which("date")
        timeout = shutil.which("timeout") or shutil.which("gtimeout")
        if not date or not timeout or not shutil.which("nc"):
            raise unittest.SkipTest("GNU date, timeout and nc required")
        os.symlink(date, Path(cls.tools.name) / "date")
        os.symlink(timeout, Path(cls.tools.name) / "timeout")

    @classmethod
    def tearDownClass(cls):
        cls.tools.cleanup()

    def check(self, *, age_hours=1, ping=b"PONG\0", engine="1.5.4", version=None, hours="48", hang=False):
        stamp = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=age_hours)).strftime("%a %b %d %H:%M:%S %Y")
        version_reply = version if version is not None else f"ClamAV {engine}/28000/{stamp}\0".encode()

        class Handler(socketserver.BaseRequestHandler):
            def handle(self):
                self.request.settimeout(2)
                try:
                    command = self.request.recv(64)
                    if hang:
                        time.sleep(4.2)
                        return
                    response = ping if command == b"zPING\0" else version_reply
                    # Split responses to ensure readiness does not assume one packet.
                    self.request.sendall(response[:3])
                    self.request.sendall(response[3:])
                except OSError:
                    pass

        with Server(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            env = dict(os.environ, PATH=self.tools.name + os.pathsep + os.environ["PATH"], CLAMAV_HEALTH_PORT=str(server.server_address[1]), SIGNATURE_MAX_AGE_HOURS=hours)
            try:
                result = subprocess.run(["sh", str(HERE / "health.sh")], env=env, capture_output=True, timeout=10)
            finally:
                server.shutdown()
            return result.returncode

    def test_current_engine_and_signatures_ready(self):
        self.assertEqual(self.check(), 0)

    def test_stale_signatures_fail_closed(self):
        self.assertEqual(self.check(age_hours=49), 3)

    def test_future_signatures_fail_closed(self):
        self.assertEqual(self.check(age_hours=-1), 3)

    def test_pin_mismatch_is_not_ready(self):
        self.assertEqual(self.check(engine="1.4.3"), 1)

    def test_malformed_ping_is_not_ready(self):
        for ping in [b"PONG", b"PONG\n", b"PO\0NG\0", b"PONG\0PONG\0"]:
            with self.subTest(ping=ping):
                self.assertEqual(self.check(ping=ping), 1)

    def test_invalid_signature_timestamp_is_not_ready(self):
        self.assertEqual(self.check(version=b"ClamAV 1.5.4/28000/not-a-date\0"), 1)

    def test_policy_cannot_extend_maximum_age(self):
        for hours in ["49", "168", "0", "12; echo unsafe", "NaN"]:
            with self.subTest(hours=hours):
                self.assertEqual(self.check(hours=hours), 2)

    def test_unresponsive_engine_is_bounded(self):
        start = time.monotonic()
        self.assertNotEqual(self.check(hang=True), 0)
        self.assertLess(time.monotonic() - start, 7)

    def test_configuration_has_only_private_tcp_and_fail_closed_limits(self):
        config = dict(line.split(maxsplit=1) for line in (HERE / "clamd.conf").read_text().splitlines() if line and not line.startswith("#"))
        self.assertEqual(config["TCPSocket"], "3310")
        self.assertEqual(config["StreamMaxLength"], "15M")
        self.assertEqual(config["AlertExceedsMax"], "yes")
        self.assertEqual(config["AlertEncrypted"], "yes")
        self.assertEqual(config["OfficialDatabaseOnly"], "yes")
        self.assertEqual(config["FailIfCvdOlderThan"], "2")
        self.assertEqual(config["LeaveTemporaryFiles"], "no")
        dockerfile = (HERE / "Dockerfile").read_text()
        self.assertEqual([line for line in dockerfile.splitlines() if line.startswith("EXPOSE ")], ["EXPOSE 3310/tcp"])
        self.assertIn("FROM scratch", dockerfile)
        blueprint = (HERE / "render.yaml").read_text()
        self.assertIn("type: pserv", blueprint)
        self.assertNotIn("\n    healthCheckPath:", blueprint)

    def test_free_profile_preserves_all_security_limits(self):
        def settings(name):
            return dict(line.split(maxsplit=1) for line in (HERE / name).read_text().splitlines() if line and not line.startswith("#"))
        expected = settings("clamd.conf")
        expected.update(MaxThreads="1", ConcurrentDatabaseReload="no")
        self.assertEqual(settings("clamd-free.conf"), expected)
        self.assertNotIn("ports:", (HERE / "compose.free.yaml").read_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
