import ResponsiveTable from "@hop/shared/ResponsiveTable";
import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { Badge, Button, Group, Modal, Paper, Select, Table, Tabs, Text, TextInput } from "@mantine/core";

export type LostItem = {
  id: string;
  ride_id: string;
  reporter_id: string;
  description: string;
  status: "open" | "driver_contacted" | "returned" | "closed";
  created_at: string;
  rider_name: string;
  rider_email: string;
  driver_name: string;
  driver_email: string;
  vehicle_number: string;
  pickup_label: string;
  dropoff_label: string;
  ride_date: string;
};

export default function OperatorLostFound({ notify }: { notify: (msg: string) => void }) {
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [updateModal, setUpdateModal] = useState<LostItem | null>(null);
  const [nextStatus, setNextStatus] = useState<string>("driver_contacted");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ lost_items: LostItem[] }>("/api/operator/lost-items");
      setItems(res.lost_items || []);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleUpdateStatus = async () => {
    if (!updateModal) return;
    setBusy(true);
    try {
      await api(`/api/operator/lost-items/${updateModal.id}`, {
        status: nextStatus,
        note: noteText,
      });
      notify("Lost property claim status updated and passenger notified.");
      setUpdateModal(null);
      setNoteText("");
      void loadItems();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (statusTab !== "all" && item.status !== statusTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.description.toLowerCase().includes(q) ||
        item.rider_name.toLowerCase().includes(q) ||
        item.driver_name.toLowerCase().includes(q) ||
        item.ride_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: LostItem["status"]) => {
    switch (status) {
      case "open":
        return <Badge color="yellow">Open Claim</Badge>;
      case "driver_contacted":
        return <Badge color="blue">Driver Contacted</Badge>;
      case "returned":
        return <Badge color="green">Returned to Rider</Badge>;
      case "closed":
        return <Badge color="gray">Closed</Badge>;
      default:
        return <Badge color="gray">{status}</Badge>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Controls Bar */}
      <Paper p="sm" withBorder style={{ borderRadius: 8, background: "#fff" }}>
        <Group justify="space-between" wrap="wrap">
          <TextInput
            placeholder="Search item description, passenger, or driver..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ width: 340, maxWidth: "100%" }}
            size="xs"
          />
          <Group gap="sm">
            <Badge color="yellow" variant="light">
              🟡 {items.filter((i) => i.status === "open").length} Open
            </Badge>
            <Badge color="blue" variant="light">
              🔵 {items.filter((i) => i.status === "driver_contacted").length} In Progress
            </Badge>
            <Badge color="green" variant="light">
              🟢 {items.filter((i) => i.status === "returned").length} Returned
            </Badge>
            <Button size="xs" variant="default" onClick={() => void loadItems()} loading={loading}>
              ↻ Refresh
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Status Tabs */}
      <Tabs value={statusTab} onChange={(val) => setStatusTab(val || "all")}>
        <Tabs.List>
          <Tabs.Tab value="all">All Claims ({items.length})</Tabs.Tab>
          <Tabs.Tab value="open">Open</Tabs.Tab>
          <Tabs.Tab value="driver_contacted">Driver Contacted</Tabs.Tab>
          <Tabs.Tab value="returned">Returned</Tabs.Tab>
          <Tabs.Tab value="closed">Closed</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* Claims Table */}
      <Paper withBorder style={{ borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <ResponsiveTable striped highlightOnHover>
          <Table.Thead style={{ background: "#f8fafc" }}>
            <Table.Tr>
              <Table.Th>Reported At</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Passenger</Table.Th>
              <Table.Th>Driver & Vehicle</Table.Th>
              <Table.Th>Ride Route</Table.Th>
              <Table.Th style={{ textAlign: "right" }}>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredItems.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                  {loading ? "Loading lost items..." : "No lost property claims found."}
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredItems.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text size="xs" fw={700}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>
                      Trip #{item.ride_id.slice(0, 8)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{getStatusBadge(item.status)}</Table.Td>
                  <Table.Td style={{ maxWidth: 240 }}>
                    <Text size="sm" fw={600} lineClamp={2}>{item.description}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={600} size="xs">{item.rider_name}</Text>
                    <Text size="xs" c="dimmed">{item.rider_email}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{item.driver_name || "Unassigned"}</Text>
                    {item.vehicle_number && (
                      <Text size="xs" c="dimmed">{item.vehicle_number}</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ maxWidth: 220 }}>
                    <Text size="xs" lineClamp={1}>🟢 {item.pickup_label}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>🔴 {item.dropoff_label}</Text>
                  </Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => {
                        setUpdateModal(item);
                        setNextStatus(
                          item.status === "open"
                            ? "driver_contacted"
                            : item.status === "driver_contacted"
                            ? "returned"
                            : "closed"
                        );
                        setNoteText("");
                      }}
                    >
                      Update
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </ResponsiveTable>
      </Paper>

      {/* Update Modal */}
      <Modal opened={Boolean(updateModal)} onClose={() => setUpdateModal(null)} title="Update Lost Item Status">
        {updateModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Text size="sm">
              Updating lost item report for <b>{updateModal.rider_name}</b>: <i>"{updateModal.description}"</i>
            </Text>
            <Select
              label="New Status"
              value={nextStatus}
              onChange={(val) => setNextStatus(val || "driver_contacted")}
              data={[
                { value: "open", label: "Open Claim" },
                { value: "driver_contacted", label: "Driver Contacted (Investigating)" },
                { value: "returned", label: "Returned to Passenger" },
                { value: "closed", label: "Closed" },
              ]}
            />
            <TextInput
              label="Notification Note to Passenger"
              placeholder="e.g. Captain TN09AB1012 confirmed item is in vehicle"
              value={noteText}
              onChange={(e) => setNoteText(e.currentTarget.value)}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setUpdateModal(null)}>
                Cancel
              </Button>
              <Button color="dark" onClick={() => void handleUpdateStatus()} loading={busy}>
                Save & Notify
              </Button>
            </Group>
          </div>
        )}
      </Modal>
    </div>
  );
}
