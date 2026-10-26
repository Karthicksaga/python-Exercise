import ResponsiveTable from "@hop/shared/ResponsiveTable";
import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { Badge, Button, Group, Modal, Paper, Table, Tabs, Text, TextInput } from "@mantine/core";

export type SOSEvent = {
  id: string;
  ride_id: string;
  account_id: string;
  lat: number;
  lng: number;
  created_at: string;
  rider_name: string;
  rider_email: string;
  driver_name: string;
  vehicle_number: string;
  ride_status: string;
  pickup_label: string;
  dropoff_label: string;
  incident_status: string;
  incident_message: string;
  resolution: string;
  incident_id?: string;
};

export type DriverScore = {
  driver_id: string;
  name: string;
  score: number;
  label: string;
  cancellations: number;
  incidents: number;
  ratings: number;
  rating_avg: number;
  completed_trips: number;
};

export default function OperatorSafety({ notify }: { notify: (msg: string) => void }) {
  const [sosEvents, setSosEvents] = useState<SOSEvent[]>([]);
  const [driverScores, setDriverScores] = useState<DriverScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolveModal, setResolveModal] = useState<SOSEvent | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sosRes, finRes] = await Promise.all([
        api<{ sos_events: SOSEvent[] }>("/api/operator/sos"),
        api<{ driver_safety: DriverScore[] }>("/api/operator/finance"),
      ]);
      setSosEvents(sosRes.sos_events || []);
      setDriverScores(finRes.driver_safety || []);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(), 12000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleResolveSOS = async () => {
    if (!resolveModal) return;
    if (resolutionText.trim().length < 3) {
      notify("Please provide an action resolution note.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/operator/sos/${resolveModal.id}/resolve`, {
        resolution: resolutionText,
        status: "closed",
      });
      notify("SOS Incident marked as resolved and closed.");
      setResolveModal(null);
      setResolutionText("");
      void loadData();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeSOSEvents = sosEvents.filter((s) => s.incident_status !== "closed");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* High-Alert Emergency Banner if any active SOS */}
      {activeSOSEvents.length > 0 && (
        <Paper
          p="md"
          withBorder
          style={{
            background: "#fee2e2",
            border: "2px solid #ef4444",
            borderRadius: 8,
            boxShadow: "0 0 16px rgba(239, 68, 68, 0.4)",
          }}
        >
          <Group justify="space-between">
            <div>
              <Text fw={800} c="red" size="md">
                🚨 ATTENTION: {activeSOSEvents.length} ACTIVE SOS EMERGENCY SIGNAL(S) RECEIVED
              </Text>
              <Text size="xs" c="dimmed">
                Immediate operator action required. Contact local authorities and dispatch safety protocols.
              </Text>
            </div>
            <Button
              color="red"
              variant="filled"
              size="sm"
              onClick={() => {
                if (activeSOSEvents[0]) {
                  setResolveModal(activeSOSEvents[0]);
                  setResolutionText("Contacted passenger and verified safety; emergency services notified if necessary.");
                }
              }}
            >
              Take Action On Latest
            </Button>
          </Group>
        </Paper>
      )}

      <Tabs defaultValue="sos">
        <Tabs.List>
          <Tabs.Tab value="sos">
            Emergency SOS Incidents{" "}
            {activeSOSEvents.length > 0 && (
              <Badge color="red" size="xs" ml={6}>
                {activeSOSEvents.length}
              </Badge>
            )}
          </Tabs.Tab>
          <Tabs.Tab value="scores">Driver Safety Scores ({driverScores.length})</Tabs.Tab>
        </Tabs.List>

        {/* SOS Incidents Tab */}
        <Tabs.Panel value="sos" pt="md">
          <Paper withBorder style={{ borderRadius: 8, overflow: "hidden", background: "#fff" }}>
            <ResponsiveTable striped highlightOnHover>
              <Table.Thead style={{ background: "#f8fafc" }}>
                <Table.Tr>
                  <Table.Th>Triggered At</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Passenger</Table.Th>
                  <Table.Th>Driver & Vehicle</Table.Th>
                  <Table.Th>Coordinates & Route</Table.Th>
                  <Table.Th>Reported Issue</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sosEvents.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                      {loading ? "Checking emergency signals..." : "No SOS emergency events reported."}
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  sosEvents.map((sos) => {
                    const isOpen = sos.incident_status !== "closed";
                    return (
                      <Table.Tr key={sos.id} style={{ background: isOpen ? "#fef2f2" : undefined }}>
                        <Table.Td>
                          <Text fw={700} size="xs" c={isOpen ? "red" : "dimmed"}>
                            {new Date(sos.created_at).toLocaleString()}
                          </Text>
                          <Text size="xs" style={{ fontFamily: "monospace" }}>
                            Ride #{sos.ride_id.slice(0, 8)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={isOpen ? "red" : "gray"}>
                            {isOpen ? "🚨 ACTIVE" : "RESOLVED"}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={600} size="xs">{sos.rider_name}</Text>
                          <Text size="xs" c="dimmed">{sos.rider_email}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{sos.driver_name || "Unassigned"}</Text>
                          {sos.vehicle_number && (
                            <Text size="xs" c="dimmed">{sos.vehicle_number}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" fw={500}>
                            📍 {sos.lat?.toFixed(4)}, {sos.lng?.toFixed(4)}
                          </Text>
                          <a
                            href={`https://www.google.com/maps?q=${sos.lat},${sos.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: "#3b82f6", textDecoration: "underline" }}
                          >
                            Open In Google Maps ↗
                          </a>
                        </Table.Td>
                        <Table.Td style={{ maxWidth: 220 }}>
                          <Text size="xs">{sos.incident_message}</Text>
                          {sos.resolution && (
                            <Text size="xs" c="green"><b>Resolution:</b> {sos.resolution}</Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {isOpen ? (
                            <Button
                              size="xs"
                              color="red"
                              onClick={() => {
                                setResolveModal(sos);
                                setResolutionText("");
                              }}
                            >
                              Resolve Incident
                            </Button>
                          ) : (
                            <Badge color="gray" variant="light">Closed</Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </ResponsiveTable>
          </Paper>
        </Tabs.Panel>

        {/* Driver Scores Tab */}
        <Tabs.Panel value="scores" pt="md">
          <Paper withBorder style={{ borderRadius: 8, overflow: "hidden", background: "#fff" }}>
            <ResponsiveTable striped highlightOnHover>
              <Table.Thead style={{ background: "#f8fafc" }}>
                <Table.Tr>
                  <Table.Th>Driver Name</Table.Th>
                  <Table.Th>Safety Score (0-100)</Table.Th>
                  <Table.Th>Status Rating</Table.Th>
                  <Table.Th>Completed Trips</Table.Th>
                  <Table.Th>Rating Avg</Table.Th>
                  <Table.Th>Cancellations</Table.Th>
                  <Table.Th>Incidents</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {driverScores.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                      No safety score data available.
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  driverScores.map((ds) => (
                    <Table.Tr key={ds.driver_id}>
                      <Table.Td>
                        <Text fw={600} size="sm">{ds.name}</Text>
                        <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>{ds.driver_id.slice(0, 8)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={800} size="md" c={ds.score >= 80 ? "green" : ds.score >= 60 ? "orange" : "red"}>
                          {ds.score}/100
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={ds.score >= 80 ? "green" : ds.score >= 60 ? "yellow" : "red"}>
                          {ds.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{ds.completed_trips}</Table.Td>
                      <Table.Td>⭐ {ds.rating_avg.toFixed(1)} ({ds.ratings} reviews)</Table.Td>
                      <Table.Td>
                        <Text c={ds.cancellations > 2 ? "red" : "dimmed"}>{ds.cancellations}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c={ds.incidents > 0 ? "red" : "dimmed"}>{ds.incidents}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </ResponsiveTable>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {/* SOS Resolution Modal */}
      <Modal opened={Boolean(resolveModal)} onClose={() => setResolveModal(null)} title="Resolve SOS Emergency Incident">
        {resolveModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Text size="sm">
              Logging resolution for SOS trigger on Trip <b>#{resolveModal.ride_id.slice(0, 8)}</b>.
            </Text>
            <TextInput
              label="Operator Resolution & Action Taken"
              placeholder="e.g. Spoke with passenger; false alarm or police dispatched"
              value={resolutionText}
              onChange={(e) => setResolutionText(e.currentTarget.value)}
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setResolveModal(null)}>
                Cancel
              </Button>
              <Button color="green" onClick={() => void handleResolveSOS()} loading={busy}>
                Confirm Resolution
              </Button>
            </Group>
          </div>
        )}
      </Modal>
    </div>
  );
}
