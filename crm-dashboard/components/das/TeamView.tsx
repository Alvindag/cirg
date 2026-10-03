"use client";

import { useState, type FormEvent } from "react";

import { Widget } from "@/components/dashboard/Widget";
import {
  Badge,
  Button,
  Empty,
  ErrorBanner,
  Input,
  Loading,
  Notice,
  PageHead,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { useDas } from "@/lib/das/context";
import { errorText } from "@/lib/das/format";
import { isAdmin, ROLES } from "@/lib/das/roles";
import type { AppUser, Role, Territory } from "@/lib/das/types";
import { useDasApi } from "@/lib/das/useDasApi";
import { useDasQuery } from "@/lib/das/useDasQuery";

export function TeamView() {
  const { me } = useDas();
  const api = useDasApi();
  const users = useDasQuery<AppUser[]>("/admin/users", {
    includeInactive: true,
  });
  const territories = useDasQuery<Territory[]>("/admin/territories");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  if (!me) return null;
  const admin = isAdmin(me.role);

  const nameOf = new Map((users.data ?? []).map((u) => [u.id, u.fullName]));
  const terrOf = new Map((territories.data ?? []).map((t) => [t.id, t.name]));

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(undefined);
    setMessage(undefined);
    try {
      await fn();
      setMessage(ok);
      users.reload();
      territories.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  function editTerritory(t: Territory) {
    const name = window.prompt("Territory name:", t.name);
    if (name === null) return;
    if (!name.trim()) {
      setError("A territory needs a name.");
      return;
    }
    const region = window.prompt("Region (empty for none):", t.region ?? "");
    if (region === null) return;
    const district = window.prompt(
      "District (empty for none):",
      t.district ?? "",
    );
    if (district === null) return;
    void act(
      () =>
        api.put(`/admin/territories/${t.id}`, {
          id: t.id,
          name: name.trim(),
          region: region.trim() || null,
          district: district.trim() || null,
        }),
      `${name.trim()} saved.`,
    );
  }

  function deleteTerritory(t: Territory) {
    if (
      !window.confirm(
        `Delete the territory ${t.name}? It can only be deleted when no people or customers are assigned to it.`,
      )
    )
      return;
    void act(() => api.del(`/admin/territories/${t.id}`), `${t.name} deleted.`);
  }

  async function deactivate(u: AppUser) {
    const all = users.data ?? [];
    let reassign: string | undefined;
    if (all.some((x) => x.managerId === u.id && x.isActive)) {
      const names = all
        .filter((x) => x.isActive && x.id !== u.id)
        .map((x) => `${x.fullName} (${x.id.slice(0, 8)})`)
        .join("\n");
      const pick = window.prompt(
        `${u.fullName} has direct reports. Enter the id (first 8 characters) of the manager who takes them over:\n\n${names}`,
      );
      if (!pick) return;
      reassign = all.find((x) => x.id.startsWith(pick.trim()))?.id;
      if (!reassign) {
        setError("No user matches that id.");
        return;
      }
    }
    await act(
      () =>
        api.post(`/admin/users/${u.id}/deactivate`, undefined, {
          reassignTo: reassign,
        }),
      `${u.fullName} was deactivated.`,
    );
  }

  return (
    <>
      <PageHead title="Team and territories" />
      {message && <Notice>{message}</Notice>}
      {error && <ErrorBanner message={error} />}

      <div className="space-y-4">
        <Widget title="People">
          {users.error && (
            <ErrorBanner message={users.error} onRetry={users.reload} />
          )}
          {users.loading && !users.data && <Loading what="Loading people" />}
          {users.data &&
            (users.data.length === 0 ? (
              <Empty>No users yet.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th>Reports to</Th>
                    <Th>Territory</Th>
                    <Th>Status</Th>
                    {admin && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                      <Td>
                        {u.fullName}
                        <div className="text-xs text-zinc-400">{u.email}</div>
                      </Td>
                      <Td>{u.role}</Td>
                      <Td>
                        {u.managerId ? (nameOf.get(u.managerId) ?? "—") : "—"}
                      </Td>
                      <Td>
                        {u.territoryId
                          ? (terrOf.get(u.territoryId) ?? "—")
                          : "—"}
                      </Td>
                      <Td>
                        <Badge tone={u.isActive ? "good" : "muted"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </Td>
                      {admin && (
                        <Td actions>
                          {u.isActive ? (
                            <Button
                              onClick={() => deactivate(u)}
                              disabled={u.id === me.id}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              onClick={() =>
                                act(
                                  () =>
                                    api.post(`/admin/users/${u.id}/reactivate`),
                                  `${u.fullName} was reactivated.`,
                                )
                              }
                            >
                              Reactivate
                            </Button>
                          )}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ))}
          {admin && users.data && territories.data && (
            <AddUser
              users={users.data}
              territories={territories.data}
              onCreate={(body) =>
                act(() => api.post("/admin/users", body), "User added.")
              }
            />
          )}
        </Widget>

        <Widget title="Territories">
          {territories.error && (
            <ErrorBanner
              message={territories.error}
              onRetry={territories.reload}
            />
          )}
          {territories.data &&
            (territories.data.length === 0 ? (
              <Empty>No territories yet.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Region</Th>
                    <Th>District</Th>
                    {admin && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {territories.data.map((t) => (
                    <tr key={t.id}>
                      <Td>{t.name}</Td>
                      <Td>{t.region ?? "—"}</Td>
                      <Td>{t.district ?? "—"}</Td>
                      {admin && (
                        <Td actions>
                          <Button
                            aria-label={`Edit territory ${t.name}`}
                            onClick={() => editTerritory(t)}
                          >
                            Edit
                          </Button>
                          <Button
                            aria-label={`Delete territory ${t.name}`}
                            onClick={() => deleteTerritory(t)}
                          >
                            Delete
                          </Button>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ))}
          {admin && (
            <AddTerritory
              onCreate={(body) =>
                act(
                  () => api.post("/admin/territories", body),
                  "Territory added.",
                )
              }
            />
          )}
        </Widget>
      </div>
    </>
  );
}

function AddUser({
  users,
  territories,
  onCreate,
}: {
  users: AppUser[];
  territories: Territory[];
  onCreate: (body: unknown) => void;
}) {
  const [f, setF] = useState({
    externalId: "",
    fullName: "",
    email: "",
    role: "Rep" as Role,
    managerId: "",
    territoryId: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate({
      ...f,
      managerId: f.managerId || null,
      territoryId: f.territoryId || null,
    });
    setF({ ...f, externalId: "", fullName: "", email: "" });
  };
  return (
    <form
      className="mt-5 grid gap-2 sm:grid-cols-2"
      onSubmit={submit}
      aria-label="Add user"
    >
      <h3 className="text-sm font-medium text-zinc-300 sm:col-span-2">
        Add a person
      </h3>
      <Input
        required
        placeholder="Entra object id"
        aria-label="Entra object id"
        value={f.externalId}
        onChange={set("externalId")}
      />
      <Input
        required
        placeholder="Full name"
        aria-label="Full name"
        value={f.fullName}
        onChange={set("fullName")}
      />
      <Input
        required
        type="email"
        placeholder="Email"
        aria-label="Email"
        value={f.email}
        onChange={set("email")}
      />
      <Select aria-label="Role" value={f.role} onChange={set("role")}>
        {ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </Select>
      <Select
        aria-label="Reports to"
        value={f.managerId}
        onChange={set("managerId")}
      >
        <option value="">No manager</option>
        {users
          .filter((u) => u.isActive)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({u.role})
            </option>
          ))}
      </Select>
      <Select
        aria-label="Territory"
        value={f.territoryId}
        onChange={set("territoryId")}
      >
        <option value="">No territory</option>
        {territories.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <div className="sm:col-span-2">
        <Button variant="primary" type="submit">
          Add
        </Button>
      </div>
    </form>
  );
}

function AddTerritory({ onCreate }: { onCreate: (body: unknown) => void }) {
  const [f, setF] = useState({ name: "", region: "", district: "" });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate({
      name: f.name,
      region: f.region || null,
      district: f.district || null,
    });
    setF({ name: "", region: "", district: "" });
  };
  return (
    <form
      className="mt-5 grid gap-2 sm:grid-cols-3"
      onSubmit={submit}
      aria-label="Add territory"
    >
      <h3 className="text-sm font-medium text-zinc-300 sm:col-span-3">
        Add a territory
      </h3>
      <Input
        required
        placeholder="Name"
        aria-label="Territory name"
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
      />
      <Input
        placeholder="Region"
        aria-label="Region"
        value={f.region}
        onChange={(e) => setF({ ...f, region: e.target.value })}
      />
      <Input
        placeholder="District"
        aria-label="District"
        value={f.district}
        onChange={(e) => setF({ ...f, district: e.target.value })}
      />
      <div className="sm:col-span-3">
        <Button variant="primary" type="submit">
          Add
        </Button>
      </div>
    </form>
  );
}
