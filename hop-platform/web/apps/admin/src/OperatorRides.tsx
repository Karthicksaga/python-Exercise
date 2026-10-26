import ResponsiveTable from "@hop/shared/ResponsiveTable";
import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { Badge, Button, Group, Modal, Paper, Select, Table, Text, TextInput } from "@mantine/core";

export type RideRecord = {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  rider: string;
  driver: string;
  pickup_label: string;
  dropoff_label: string;
  fare_paise: number;
  discount_paise: number;
  payable_paise: number;
  refunded_paise: number;
};

export default function OperatorRides({ notify }: { notify: (msg: string) => void }) {
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRide, setSelectedRide] = useState<RideRecord | null>(null);
  const [refundModal, setRefundModal] = useState<RideRecord | null>(null);
  const [cancelModal, setCancelModal] = useState<RideRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRides = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await api<{ rides: RideRecord[] }>(`/api/operator/rides?q=${encodeURIComponent(query)}`);
      setRides(res.rides || []);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadRides(search);
  };

  const filteredRides = rides.filter((r) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return ["requested", "accepted", "arrived", "in_progress"].includes(r.status);
    return r.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge color="green">Completed</Badge>;
      case "in_progress":
        return <Badge color="blue">In Transit</Badge>;
      case "accepted":
      case "arrived":
        return <Badge color="cyan">{status}</Badge>;
      case "requested":
        return <Badge color="orange">Searching</Badge>;
      case "cancelled":
        return <Badge color="red">Cancelled</Badge>;
      case "expired":
        return <Badge color="gray">Expired</Badge>;
      default:
        return <Badge color="gray">{status}</Badge>;
    }
  };

  const handleCancelRide = async () => {
    if (!cancelModal) return;
    setBusy(true);
    try {
      await api(`/api/operator/rides/${cancelModal.id}/cancel`, {
        reason: cancelReason || "Cancelled by admin operations",
      });
      notify("Ride successfully cancelled and logged to audit trail.");
      setCancelModal(null);
      setCancelReason("");
      void loadRides(search);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRefundRide = async () => {
    if (!refundModal) return;
    const amount = Math.round(parseFloat(refundAmount) * 100);
    if (isNaN(amount) || amount <= 0) {
      notify("Please enter a valid refund amount.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/operator/refunds", {
        ride_id: refundModal.id,
        amount_paise: amount,
        reason: refundReason || "Customer satisfaction adjustment",
        clawback_driver: false,
      });
      notify("Refund successfully credited to rider's wallet.");
      setRefundModal(null);
      setRefundAmount("");
      setRefundReason("");
      void loadRides(search);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Search and Filters Header */}
      <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff" }}>
        <form onSubmit={handleSearchSubmit}>
          <Group justify="space-between" wrap="wrap">
            <Group gap="sm" style={{ flex: "1 1 280px", minWidth: 0 }}>
              <TextInput
                placeholder="Search by ID prefix, rider name, driver name..."
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit" variant="filled" color="dark">
                Search
              </Button>
              {search && (
                <Button
                  variant="subtle"
                  onClick={() => {
                    setSearch("");
                    void loadRides("");
                  }}
                >
                  Clear
                </Button>
              )}
            </Group>

            <Group gap="xs">
              <Select
                value={statusFilter}
                onChange={(val) => setStatusFilter(val || "all")}
                data={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active Trips Only" },
                  { value: "completed", label: "Completed" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "requested", label: "Requested" },
                ]}
                style={{ width: 170 }}
              />
              <Button variant="default" onClick={() => void loadRides(search)} loading={loading}>
                ↻ Refresh
              </Button>
            </Group>
          </Group>
        </form>
      </Paper>

      {/* Rides Table */}
      <Paper withBorder style={{ borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <ResponsiveTable striped highlightOnHover>
          <Table.Thead style={{ background: "#f8fafc" }}>
            <Table.Tr>
              <Table.Th>ID & Time</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Rider</Table.Th>
              <Table.Th>Driver</Table.Th>
              <Table.Th>Route</Table.Th>
              <Table.Th>Fare</Table.Th>
              <Table.Th>Payment</Table.Th>
              <Table.Th style={{ textAlign: "right" }}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredRides.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                  {loading ? "Loading rides..." : "No rides found matching current criteria."}
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredRides.map((ride) => {
                const isActive = ["requested", "accepted", "arrived", "in_progress"].includes(ride.status);
                const isCompleted = ride.status === "completed";
                const netPayable = ride.payable_paise / 100;
                return (
                  <Table.Tr key={ride.id}>
                    <Table.Td>
                      <Text fw={700} size="xs" style={{ fontFamily: "monospace" }}>
                        #{ride.id.slice(0, 8)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {new Date(ride.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </Table.Td>
                    <Table.Td>{getStatusBadge(ride.status)}</Table.Td>
                    <Table.Td>
                      <Text fw={600} size="xs">{ride.rider}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{ride.driver || <span style={{ color: "#94a3b8" }}>Unassigned</span>}</Text>
                    </Table.Td>
                    <Table.Td style={{ maxWidth: 260 }}>
                      <Text size="xs" fw={500} lineClamp={1}>🟢 {ride.pickup_label}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>🔴 {ride.dropoff_label}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={700} size="xs">₹{netPayable.toFixed(2)}</Text>
                      {ride.discount_paise > 0 && (
                        <Text size="xs" c="green">-₹{(ride.discount_paise / 100).toFixed(0)} promo</Text>
                      )}
                      {ride.refunded_paise > 0 && (
                        <Text size="xs" c="red">-₹{(ride.refunded_paise / 100).toFixed(0)} refunded</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="outline" color={ride.payment_method === "upi" ? "indigo" : "teal"}>
                        {ride.payment_method.toUpperCase()}
                      </Badge>
                      <Text size="xs" c="dimmed">{ride.payment_status}</Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Group gap={6} justify="flex-end">
                        <Button size="xs" variant="subtle" onClick={() => setSelectedRide(ride)}>
                          Inspect
                        </Button>
                        {isActive && (
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={() => {
                              setCancelModal(ride);
                              setCancelReason("");
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                        {isCompleted && ride.refunded_paise < ride.payable_paise && (
                          <Button
                            size="xs"
                            color="orange"
                            variant="subtle"
                            onClick={() => {
                              setRefundModal(ride);
                              setRefundAmount(((ride.payable_paise - ride.refunded_paise) / 100).toFixed(2));
                              setRefundReason("");
                            }}
                          >
                            Refund
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </ResponsiveTable>
      </Paper>

      {/* Ride Detail Inspection Modal */}
      <Modal opened={Boolean(selectedRide)} onClose={() => setSelectedRide(null)} title="Ride Lifecycle Inspection" size="md">
        {selectedRide && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Group justify="space-between">
              <div>
                <Text fw={700} size="md">Trip ID: {selectedRide.id}</Text>
                <Text size="xs" c="dimmed">Booked at: {new Date(selectedRide.created_at).toLocaleString()}</Text>
              </div>
              {getStatusBadge(selectedRide.status)}
            </Group>

            <Paper p="sm" withBorder style={{ background: "#f8fafc" }}>
              <Text size="xs" fw={700} c="dimmed" mb={4}>PARTICIPANTS</Text>
              <Text size="sm"><b>Passenger:</b> {selectedRide.rider}</Text>
              <Text size="sm"><b>Assigned Driver:</b> {selectedRide.driver || "None (Searching/Cancelled)"}</Text>
            </Paper>

            <Paper p="sm" withBorder style={{ background: "#f8fafc" }}>
              <Text size="xs" fw={700} c="dimmed" mb={4}>ROUTE DETAILS</Text>
              <Text size="sm"><b>Pickup:</b> {selectedRide.pickup_label}</Text>
              <Text size="sm"><b>Dropoff:</b> {selectedRide.dropoff_label}</Text>
            </Paper>

            <Paper p="sm" withBorder style={{ background: "#f8fafc" }}>
              <Text size="xs" fw={700} c="dimmed" mb={4}>FINANCIAL BREAKDOWN</Text>
              <Group justify="space-between">
                <Text size="sm">Base Fare:</Text>
                <Text size="sm">₹{(selectedRide.fare_paise / 100).toFixed(2)}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Platform Discount:</Text>
                <Text size="sm" c="green">-₹{(selectedRide.discount_paise / 100).toFixed(2)}</Text>
              </Group>
              <Group justify="space-between" mt={4} pt={4} style={{ borderTop: "1px dashed #cbd5e1" }}>
                <Text size="sm" fw={700}>Rider Net Payable:</Text>
                <Text size="sm" fw={700}>₹{(selectedRide.payable_paise / 100).toFixed(2)}</Text>
              </Group>
              {selectedRide.refunded_paise > 0 && (
                <Group justify="space-between" mt={2}>
                  <Text size="sm" c="red">Refunded So Far:</Text>
                  <Text size="sm" c="red">₹{(selectedRide.refunded_paise / 100).toFixed(2)}</Text>
                </Group>
              )}
            </Paper>

            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={() => setSelectedRide(null)}>
                Close
              </Button>
            </Group>
          </div>
        )}
      </Modal>

      {/* Cancel Ride Confirmation Modal */}
      <Modal opened={Boolean(cancelModal)} onClose={() => setCancelModal(null)} title="Cancel Active Ride" size="sm">
        {cancelModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Text size="sm">
              Are you sure you want to cancel Trip <b>#{cancelModal.id.slice(0, 8)}</b>? Both rider and driver will be notified.
            </Text>
            <TextInput
              label="Cancellation Reason"
              placeholder="e.g. Driver vehicle breakdown, rider unresponsive"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.currentTarget.value)}
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setCancelModal(null)}>
                Dismiss
              </Button>
              <Button color="red" onClick={() => void handleCancelRide()} loading={busy}>
                Confirm Cancellation
              </Button>
            </Group>
          </div>
        )}
      </Modal>

      {/* Refund Modal */}
      <Modal opened={Boolean(refundModal)} onClose={() => setRefundModal(null)} title="Issue Wallet Refund" size="sm">
        {refundModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Text size="sm">
              Issue an instant wallet refund for <b>{refundModal.rider}</b> on ride #{refundModal.id.slice(0, 8)}.
            </Text>
            <TextInput
              label="Refund Amount (₹)"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.currentTarget.value)}
              required
            />
            <TextInput
              label="Reason for Refund"
              placeholder="e.g. Overcharged, route detour, vehicle AC issue"
              value={refundReason}
              onChange={(e) => setRefundReason(e.currentTarget.value)}
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setRefundModal(null)}>
                Cancel
              </Button>
              <Button color="orange" onClick={() => void handleRefundRide()} loading={busy}>
                Process Refund
              </Button>
            </Group>
          </div>
        )}
      </Modal>
    </div>
  );
}
