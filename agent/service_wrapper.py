"""Runs windows_agent.py as a native Windows Service ("CIRGAgent") using
pywin32. This is what install.ps1 registers so the agent survives reboots
and restarts automatically on failure, on Windows 10, Windows 11, and
Windows Server 2016+.

Usage (elevated PowerShell/cmd, from the agent install directory):
    python service_wrapper.py install
    python service_wrapper.py start
    python service_wrapper.py stop
    python service_wrapper.py remove

install.ps1 does this for you automatically after enrollment.
"""

import os
import sys
import threading

import servicemanager
import win32event
import win32service
import win32serviceutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import windows_agent  # noqa: E402


class CIRGAgentService(win32serviceutil.ServiceFramework):
    _svc_name_ = "CIRGAgent"
    _svc_display_name_ = "CIRG Enterprise Security Operations Agent"
    _svc_description_ = (
        "Collects Windows security telemetry for the CIRG SOC platform and "
        "executes remediation actions (host isolation, process termination, "
        "account disable) issued from the SOC dashboard."
    )

    def __init__(self, args):
        super().__init__(args)
        self.stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._worker = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.stop_event)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        windows_agent._setup_logging()
        cfg = windows_agent.load_config()
        state = windows_agent.load_state()
        client = windows_agent.CollectorClient(cfg["server_url"], cfg["api_key"])
        interval = cfg.get("poll_interval_seconds", 30)

        self._worker = threading.Thread(
            target=self._run_loop, args=(cfg, state, client, interval), daemon=True
        )
        self._worker.start()

        win32event.WaitForSingleObject(self.stop_event, win32event.INFINITE)

    def _run_loop(self, cfg, state, client, interval):
        while win32event.WaitForSingleObject(self.stop_event, 0) != win32event.WAIT_OBJECT_0:
            try:
                windows_agent.run_once(cfg, state, client)
            except Exception:
                windows_agent.log.exception("service cycle failed; will retry")
            win32event.WaitForSingleObject(self.stop_event, interval * 1000)


if __name__ == "__main__":
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(CIRGAgentService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(CIRGAgentService)
