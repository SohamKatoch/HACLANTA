"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faChartLine,
  faLaptopMedical,
  faRightFromBracket,
  faShieldHalved,
  faSliders,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_THRESHOLDS,
  archiveAdminManagedUser,
  loadAdminDashboardUsers,
  resetManagedUserThresholds,
  type DashboardUser,
  type RiskThresholds,
  updateAlertFlag,
  upsertAdminManagedUser,
} from "@/lib/admin-dashboard";
import {
  authenticateAdmin,
  clearStoredAdminSession,
  getStoredAdminSession,
  storeAdminSession,
  type AdminSession,
} from "@/lib/admin-auth";

type UserEditorState = {
  assignedDevices: string;
  email: string;
  id?: string;
  name: string;
  role: string;
  thresholds: RiskThresholds;
  userId?: string;
};

const ROLE_OPTIONS = ["Driver", "Supervisor", "Admin Viewer"];

function buildEmptyEditorState(): UserEditorState {
  return {
    name: "",
    email: "",
    role: "Driver",
    assignedDevices: "",
    thresholds: DEFAULT_THRESHOLDS,
  };
}

function buildEditorState(user: DashboardUser): UserEditorState {
  return {
    id: user.id,
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedDevices: user.assignedDevices.join(", "),
    thresholds: user.thresholds,
  };
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString();
}

function statusVariant(status: DashboardUser["latestStatus"]) {
  if (status === "NOT SAFE") {
    return "danger" as const;
  }

  if (status === "SAFE") {
    return "safe" as const;
  }

  return "outline" as const;
}

function riskThresholdSummary(thresholds: RiskThresholds) {
  return `EC ${thresholds.eyeClosure}% | BR ${thresholds.blinkRate}/m | HT ${thresholds.headTilt}deg | RT ${thresholds.reactionTime}s`;
}

export default function AdminDashboard() {
  const [authChecked, setAuthChecked] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("1234");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorState, setEditorState] = useState<UserEditorState>(buildEmptyEditorState);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");

  function refreshUsers(preferredEmail?: string | null) {
    const nextUsers = loadAdminDashboardUsers();
    setUsers(nextUsers);

    if (nextUsers.length === 0) {
      setSelectedEmail(null);
      return;
    }

    const nextSelected =
      preferredEmail && nextUsers.some((user) => user.email === preferredEmail)
        ? preferredEmail
        : selectedEmail && nextUsers.some((user) => user.email === selectedEmail)
          ? selectedEmail
          : nextUsers[0]?.email ?? null;

    setSelectedEmail(nextSelected);
  }

  useEffect(() => {
    const session = getStoredAdminSession();
    setAdminSession(session);

    if (session) {
      refreshUsers();
    }

    setAuthChecked(true);
  }, []);

  const selectedUser = users.find((user) => user.email === selectedEmail) ?? users[0] ?? null;
  const summary = useMemo(() => {
    const totalDevices = users.reduce((sum, user) => sum + user.assignedDevices.length, 0);
    const totalAlerts = users.reduce((sum, user) => sum + user.alerts.length, 0);
    const flaggedAlerts = users.reduce(
      (sum, user) => sum + user.alerts.filter((alert) => alert.flag !== null).length,
      0,
    );
    const confidenceValues = users
      .map((user) => user.averageConfidence)
      .filter((value): value is number => value !== null);

    return {
      totalDevices,
      totalAlerts,
      flaggedAlerts,
      averageConfidence:
        confidenceValues.length > 0
          ? Math.round(
              confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length,
            )
          : null,
    };
  }, [users]);

  function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = authenticateAdmin({
      username: loginUsername,
      password: loginPassword,
    });

    if (!result.session) {
      setLoginError(result.error ?? "We could not verify admin access.");
      return;
    }

    storeAdminSession(result.session);
    setAdminSession(result.session);
    setLoginError(null);
    refreshUsers();
  }

  function handleSignOut() {
    clearStoredAdminSession();
    setAdminSession(null);
    setUsers([]);
    setSelectedEmail(null);
    setDialogOpen(false);
  }

  function openAddUserDialog() {
    setEditorMode("add");
    setEditorState(buildEmptyEditorState());
    setDialogOpen(true);
  }

  function openEditUserDialog(user: DashboardUser) {
    setEditorMode("edit");
    setEditorState(buildEditorState(user));
    setDialogOpen(true);
  }

  function handleSaveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    upsertAdminManagedUser({
      id: editorState.id,
      userId: editorState.userId,
      name: editorState.name,
      email: editorState.email,
      role: editorState.role,
      assignedDevices: editorState.assignedDevices
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      thresholds: editorState.thresholds,
    });

    setDialogOpen(false);
    refreshUsers(editorState.email.trim().toLowerCase());
  }

  function handleDeleteUser(user: DashboardUser) {
    if (!window.confirm(`Hide ${user.name} from the admin dashboard?`)) {
      return;
    }

    archiveAdminManagedUser(user);
    refreshUsers(selectedUser?.email === user.email ? null : selectedUser?.email ?? null);
  }

  function handleResetThresholds(user: DashboardUser) {
    resetManagedUserThresholds(user);
    refreshUsers(user.email);
  }

  function handleFlagToggle(
    alertId: string,
    nextFlag: "correct" | "false_positive",
    currentFlag: "correct" | "false_positive" | null,
  ) {
    updateAlertFlag(alertId, currentFlag === nextFlag ? null : nextFlag);
    refreshUsers(selectedUser?.email ?? null);
  }

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#efe6d7] px-6 py-10 text-[#111111]">
        <div className="rounded-full border border-black/10 bg-white/75 px-5 py-3 font-mono text-xs uppercase tracking-[0.24em] text-slate-500 shadow-sm">
          Preparing Admin Route
        </div>
      </main>
    );
  }

  if (!adminSession) {
    return (
      <main className="min-h-screen bg-[#efe6d7] px-6 py-10 text-[#111111]">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
          <Card className="w-full max-w-xl border-black/10 bg-white/75 shadow-[0_28px_90px_rgba(17,17,17,0.08)] backdrop-blur-xl">
            <CardHeader className="gap-3 p-8">
              <Badge className="w-fit bg-black/5 text-[#111111]" variant="outline">
                Private Admin Route
              </Badge>
              <CardTitle className="text-4xl tracking-[-0.06em] text-[#111111]">
                /admin
              </CardTitle>
              <CardDescription className="max-w-lg text-base leading-7 text-[#111111]/66">
                This dashboard stays off the public flow and only unlocks with the admin
                credentials for this local demo.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              <form className="grid gap-5" onSubmit={handleLogin}>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  <span>Username</span>
                  <Input
                    onChange={(event) => setLoginUsername(event.target.value)}
                    placeholder="admin"
                    required
                    value={loginUsername}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  <span>Password</span>
                  <Input
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="1234"
                    required
                    type="password"
                    value={loginPassword}
                  />
                </label>

                <div className="rounded-2xl border border-black/10 bg-[#f7f0e3] px-4 py-3 text-sm text-[#6d675c]">
                  Admin login: <span className="font-semibold text-[#111111]">admin</span> /
                  <span className="ml-1 font-semibold text-[#111111]">1234</span>
                </div>

                {loginError ? <p className="text-sm text-[var(--risk)]">{loginError}</p> : null}

                <Button
                  className="bg-[linear-gradient(135deg,#1f7a4f,#33a56b)] text-white shadow-[0_16px_35px_rgba(31,122,79,0.22)]"
                  size="lg"
                  type="submit"
                >
                  Unlock Admin Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#efe6d7] px-6 py-8 text-[#111111] lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-white/72 p-6 shadow-[0_24px_70px_rgba(17,17,17,0.08)] backdrop-blur-xl sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,236,168,0.28),transparent_44%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="w-fit bg-black/5 text-[#111111]" variant="outline">
                Hidden Fleet Console
              </Badge>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.07em] text-[#111111] sm:text-5xl">
                Admin dashboard for users, thresholds, and alert review.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#111111]/66">
                Same visual system, separate access. This route is intentionally private and uses
                local demo data where live backend records are not available yet.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="safe">Signed in as {adminSession.username}</Badge>
              <Button onClick={openAddUserDialog} variant="outline">
                Add User
              </Button>
              <Button onClick={handleSignOut} variant="ghost">
                <FontAwesomeIcon className="text-sm" icon={faRightFromBracket} />
                Sign Out
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-black/10 bg-white/78 shadow-[0_18px_48px_rgba(17,17,17,0.06)]">
            <CardContent className="flex items-start justify-between p-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Users Managed
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.06em]">{users.length}</p>
              </div>
              <FontAwesomeIcon className="text-xl text-[#1f7a4f]" icon={faUsers} />
            </CardContent>
          </Card>
          <Card className="border-black/10 bg-white/78 shadow-[0_18px_48px_rgba(17,17,17,0.06)]">
            <CardContent className="flex items-start justify-between p-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Assigned Devices
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.06em]">
                  {summary.totalDevices}
                </p>
              </div>
              <FontAwesomeIcon className="text-xl text-[#111111]" icon={faLaptopMedical} />
            </CardContent>
          </Card>
          <Card className="border-black/10 bg-white/78 shadow-[0_18px_48px_rgba(17,17,17,0.06)]">
            <CardContent className="flex items-start justify-between p-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Alerts Logged
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.06em]">
                  {summary.totalAlerts}
                </p>
              </div>
              <FontAwesomeIcon className="text-xl text-[var(--risk)]" icon={faBell} />
            </CardContent>
          </Card>
          <Card className="border-black/10 bg-white/78 shadow-[0_18px_48px_rgba(17,17,17,0.06)]">
            <CardContent className="flex items-start justify-between p-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Avg Confidence
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.06em]">
                  {summary.averageConfidence !== null ? `${summary.averageConfidence}%` : "--"}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {summary.flaggedAlerts} flagged alert review decisions
                </p>
              </div>
              <FontAwesomeIcon className="text-xl text-[#c97132]" icon={faChartLine} />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <Card className="overflow-hidden border-black/10 bg-white/78 shadow-[0_24px_70px_rgba(17,17,17,0.06)]">
            <CardHeader className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Users Management
                </p>
                <CardTitle className="mt-2 text-3xl tracking-[-0.05em]">
                  Table view
                </CardTitle>
                <CardDescription>
                  Edit roles, device assignments, and local drowsiness thresholds.
                </CardDescription>
              </div>
              <Button onClick={openAddUserDialog} variant="outline">
                Add User
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {users.length === 0 ? (
                <div className="px-6 pb-6 text-sm leading-6 text-slate-600">
                  No admin-visible users yet. Add one here or create a driver account in the app
                  and it will appear automatically.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-[#f7f0e3]">
                      <tr className="border-y border-black/8">
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Name
                        </th>
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Email
                        </th>
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Role
                        </th>
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Assigned Device
                        </th>
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Last Active
                        </th>
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Risk Thresholds
                        </th>
                        <th className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const isSelected = selectedUser?.email === user.email;
                        return (
                          <tr
                            className={`border-b border-black/8 transition-colors ${
                              isSelected ? "bg-white" : "bg-white/45 hover:bg-white/70"
                            }`}
                            key={user.email}
                          >
                            <td className="px-4 py-4">
                              <button
                                className="grid gap-1 text-left"
                                onClick={() => setSelectedEmail(user.email)}
                                type="button"
                              >
                                <span className="font-semibold text-slate-950">{user.name}</span>
                                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {user.source === "driver" ? "Driver-linked" : "Admin-managed"}
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-4 text-slate-600">{user.email}</td>
                            <td className="px-4 py-4">
                              <Badge variant="outline">{user.role}</Badge>
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {user.assignedDevices.length > 0
                                ? user.assignedDevices.join(", ")
                                : "--"}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {formatTimestamp(user.lastActive)}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {riskThresholdSummary(user.thresholds)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() => openEditUserDialog(user)}
                                  size="xs"
                                  type="button"
                                  variant="outline"
                                >
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => handleDeleteUser(user)}
                                  size="xs"
                                  type="button"
                                  variant="destructive"
                                >
                                  Delete
                                </Button>
                                <Button
                                  onClick={() => handleResetThresholds(user)}
                                  size="xs"
                                  type="button"
                                  variant="secondary"
                                >
                                  Reset Thresholds
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="border-black/10 bg-white/78 shadow-[0_24px_70px_rgba(17,17,17,0.06)]">
              <CardHeader className="p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  User Profile
                </p>
                <CardTitle className="mt-2 text-3xl tracking-[-0.05em]">
                  {selectedUser ? selectedUser.name : "No user selected"}
                </CardTitle>
                <CardDescription>
                  {selectedUser
                    ? "Historical metrics and alert review for the selected user."
                    : "Choose a user from the table to inspect profile details."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 p-6 pt-0">
                {selectedUser ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{selectedUser.role}</Badge>
                      <Badge variant={statusVariant(selectedUser.latestStatus)}>
                        {selectedUser.latestStatus ?? "No status"}
                      </Badge>
                      <Badge variant="outline">{selectedUser.email}</Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Card className="border-black/8 bg-[#f7f0e3] shadow-none">
                        <CardContent className="p-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            Historical Metrics
                          </p>
                          <p className="mt-2 text-2xl font-semibold">{selectedUser.captureCount}</p>
                          <p className="mt-1 text-sm text-slate-600">total captures</p>
                        </CardContent>
                      </Card>
                      <Card className="border-black/8 bg-[#f7f0e3] shadow-none">
                        <CardContent className="p-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            Average Confidence
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {selectedUser.averageConfidence !== null
                              ? `${selectedUser.averageConfidence}%`
                              : "--"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">across saved reads</p>
                        </CardContent>
                      </Card>
                      <Card className="border-black/8 bg-[#f7f0e3] shadow-none">
                        <CardContent className="p-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            Average Blink Rate
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {selectedUser.averageBlinkRate !== null
                              ? `${selectedUser.averageBlinkRate}/m`
                              : "--"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">rolling session baseline</p>
                        </CardContent>
                      </Card>
                      <Card className="border-black/8 bg-[#f7f0e3] shadow-none">
                        <CardContent className="p-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            Last Active
                          </p>
                          <p className="mt-2 text-lg font-semibold leading-6">
                            {formatTimestamp(selectedUser.lastActive)}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="border-black/8 bg-slate-50 shadow-none">
                      <CardHeader className="gap-2 p-4">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon className="text-slate-500" icon={faSliders} />
                          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                            Risk Thresholds
                          </p>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-3 p-4 pt-0 text-sm text-slate-700">
                        <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-4 py-3">
                          <span>Eye closure</span>
                          <span className="font-semibold">{selectedUser.thresholds.eyeClosure}%</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-4 py-3">
                          <span>Blink rate</span>
                          <span className="font-semibold">{selectedUser.thresholds.blinkRate}/min</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-4 py-3">
                          <span>Head tilt</span>
                          <span className="font-semibold">{selectedUser.thresholds.headTilt} deg</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-4 py-3">
                          <span>Reaction time</span>
                          <span className="font-semibold">{selectedUser.thresholds.reactionTime}s</span>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    The profile panel will populate after you select a user from the table.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-black/10 bg-white/78 shadow-[0_24px_70px_rgba(17,17,17,0.06)]">
              <CardHeader className="p-6">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon className="text-[var(--risk)]" icon={faShieldHalved} />
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Alerts History
                    </p>
                    <CardDescription>
                      Flag events as correct or false positive.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 p-6 pt-0">
                {!selectedUser ? (
                  <p className="text-sm text-slate-600">Select a user to inspect alerts.</p>
                ) : selectedUser.alerts.length === 0 ? (
                  <p className="text-sm leading-6 text-slate-600">
                    No alert history is available for this user yet.
                  </p>
                ) : (
                  selectedUser.alerts.slice(0, 6).map((alert) => (
                    <Card className="border-black/8 bg-slate-50 shadow-none" key={alert.id}>
                      <CardContent className="grid gap-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-950">
                              {alert.confidence}% confidence at {formatTimestamp(alert.createdAt)}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              Eye {alert.eyeClosure}% | Blink {alert.blinkRate}/m | Tilt{" "}
                              {alert.headTilt} deg | Reaction {alert.reactionTime}s
                            </p>
                          </div>
                          <Badge variant="danger">NOT SAFE</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className={
                              alert.flag === "correct"
                                ? "bg-[#1f7a4f] text-white hover:bg-[#1f7a4f]/90"
                                : ""
                            }
                            onClick={() => handleFlagToggle(alert.id, "correct", alert.flag)}
                            size="xs"
                            type="button"
                            variant={alert.flag === "correct" ? "default" : "outline"}
                          >
                            Correct
                          </Button>
                          <Button
                            className={
                              alert.flag === "false_positive"
                                ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/92"
                                : ""
                            }
                            onClick={() =>
                              handleFlagToggle(alert.id, "false_positive", alert.flag)
                            }
                            size="xs"
                            type="button"
                            variant={alert.flag === "false_positive" ? "accent" : "outline"}
                          >
                            False Positive
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-black/10 bg-white/78 shadow-[0_24px_70px_rgba(17,17,17,0.06)]">
              <CardHeader className="p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Recent Reads
                </p>
                <CardDescription>
                  Latest captures for the selected user.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 p-6 pt-0">
                {!selectedUser ? (
                  <p className="text-sm text-slate-600">Select a user to inspect their readings.</p>
                ) : selectedUser.history.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No saved capture history is available yet.
                  </p>
                ) : (
                  selectedUser.history.slice(0, 5).map((item) => (
                    <div
                      className="rounded-xl border border-black/8 bg-slate-50 px-4 py-3"
                      key={item.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium text-slate-950">{formatTimestamp(item.createdAt)}</p>
                        <Badge variant={item.status === "NOT SAFE" ? "danger" : "safe"}>
                          {item.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Confidence {item.confidence}% | Blink {item.blinkRate}/m | Eye{" "}
                        {item.eyeClosure}% | Reaction {item.reactionTime}s
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="w-[min(94vw,40rem)]">
          <DialogHeader>
            <DialogTitle>{editorMode === "add" ? "Add user" : "Edit user"}</DialogTitle>
            <DialogDescription>
              Store local-only management details for the admin dashboard.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleSaveUser}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                <span>Name</span>
                <Input
                  onChange={(event) =>
                    setEditorState((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Jamie Carter"
                  required
                  value={editorState.name}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                <span>Email</span>
                <Input
                  onChange={(event) =>
                    setEditorState((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="jamie@fleet.local"
                  required
                  type="email"
                  value={editorState.email}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>Role</span>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                onChange={(event) =>
                  setEditorState((current) => ({ ...current, role: event.target.value }))
                }
                value={editorState.role}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>Assign device(s)</span>
              <Input
                onChange={(event) =>
                  setEditorState((current) => ({
                    ...current,
                    assignedDevices: event.target.value,
                  }))
                }
                placeholder="VIN-001, VIN-002"
                value={editorState.assignedDevices}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                <span>Eye closure %</span>
                <Input
                  min="0"
                  onChange={(event) =>
                    setEditorState((current) => ({
                      ...current,
                      thresholds: {
                        ...current.thresholds,
                        eyeClosure: Number(event.target.value || 0),
                      },
                    }))
                  }
                  step="1"
                  type="number"
                  value={editorState.thresholds.eyeClosure}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                <span>Blink rate</span>
                <Input
                  min="0"
                  onChange={(event) =>
                    setEditorState((current) => ({
                      ...current,
                      thresholds: {
                        ...current.thresholds,
                        blinkRate: Number(event.target.value || 0),
                      },
                    }))
                  }
                  step="1"
                  type="number"
                  value={editorState.thresholds.blinkRate}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                <span>Head tilt</span>
                <Input
                  min="0"
                  onChange={(event) =>
                    setEditorState((current) => ({
                      ...current,
                      thresholds: {
                        ...current.thresholds,
                        headTilt: Number(event.target.value || 0),
                      },
                    }))
                  }
                  step="1"
                  type="number"
                  value={editorState.thresholds.headTilt}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                <span>Reaction time</span>
                <Input
                  min="0"
                  onChange={(event) =>
                    setEditorState((current) => ({
                      ...current,
                      thresholds: {
                        ...current.thresholds,
                        reactionTime: Number(event.target.value || 0),
                      },
                    }))
                  }
                  step="0.1"
                  type="number"
                  value={editorState.thresholds.reactionTime}
                />
              </label>
            </div>

            <DialogFooter>
              <Button onClick={() => setDialogOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button type="submit">{editorMode === "add" ? "Create User" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
