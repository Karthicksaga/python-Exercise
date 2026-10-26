import ResponsiveTable from "@hop/shared/ResponsiveTable";
import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { Badge, Button, Group, Paper, Progress, SimpleGrid, Table, Text } from "@mantine/core";

export type AnalyticsData = {
  gmv_today_paise: number;
  gmv_all_time_paise: number;
  commission_all_time_paise: number;
  completed_rides: number;
  cancelled_rides: number;
  total_rides: number;
  active_drivers: number;
  total_drivers: number;
  total_riders: number;
  payments: {
    payment_method: string;
    count: number;
    total_paise: number;
  }[];
  volume: {
    day: string;
    count: number;
    completed: number;
  }[];
};

export default function OperatorAnalytics({ notify }: { notify: (msg: string) => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AnalyticsData>("/api/operator/analytics");
      setData(res);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!data && loading) {
    return <Text p="xl">Loading executive analytics...</Text>;
  }

  const completionRate = data && data.total_rides > 0
    ? ((data.completed_rides / data.total_rides) * 100).toFixed(1)
    : "0.0";

  const cancellationRate = data && data.total_rides > 0
    ? ((data.cancelled_rides / data.total_rides) * 100).toFixed(1)
    : "0.0";

  const totalPaymentPaise = (data?.payments ?? []).reduce((acc, p) => acc + Number(p.total_paise), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Header */}
      <Group justify="space-between">
        <div>
          <Text size="sm" c="dimmed">Platform-wide Gross Merchandise Value, revenue, and fleet utilization</Text>
        </div>
        <Button size="xs" variant="default" onClick={() => void loadData()} loading={loading}>
          ↻ Refresh Metrics
        </Button>
      </Group>

      {/* Primary KPI Grid */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff", borderTop: "4px solid #10b981" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Today's GMV</Text>
          <Text fw={800} size="xl" mt={4}>
            ₹{((data?.gmv_today_paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </Text>
          <Text size="xs" c="green" mt={2}>Live booking volume today</Text>
        </Paper>

        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff", borderTop: "4px solid #3b82f6" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">All-Time GMV</Text>
          <Text fw={800} size="xl" mt={4}>
            ₹{((data?.gmv_all_time_paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </Text>
          <Text size="xs" c="dimmed" mt={2}>Total gross transactions</Text>
        </Paper>

        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff", borderTop: "4px solid #8b5cf6" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Platform Commission</Text>
          <Text fw={800} size="xl" mt={4}>
            ₹{((data?.commission_all_time_paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </Text>
          <Text size="xs" c="dimmed" mt={2}>Estimated take-rate (~20%)</Text>
        </Paper>

        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff", borderTop: "4px solid #f59e0b" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Online Fleet</Text>
          <Text fw={800} size="xl" mt={4}>
            {data?.active_drivers ?? 0} <small style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>/ {data?.total_drivers ?? 0} drivers</small>
          </Text>
          <Text size="xs" c="green" mt={2}>Currently duty online</Text>
        </Paper>
      </SimpleGrid>

      {/* Second Row: Operations & Conversion Rates */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Trip Completion Rate</Text>
          <Group justify="space-between" mt={4}>
            <Text fw={800} size="xl" c="green">{completionRate}%</Text>
            <Badge color="green" size="md">{data?.completed_rides ?? 0} trips</Badge>
          </Group>
          <Progress value={parseFloat(completionRate)} color="green" size="sm" mt="sm" />
        </Paper>

        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Cancellation Rate</Text>
          <Group justify="space-between" mt={4}>
            <Text fw={800} size="xl" c={parseFloat(cancellationRate) > 15 ? "red" : "orange"}>
              {cancellationRate}%
            </Text>
            <Badge color="red" size="md">{data?.cancelled_rides ?? 0} cancelled</Badge>
          </Group>
          <Progress value={parseFloat(cancellationRate)} color="red" size="sm" mt="sm" />
        </Paper>

        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Total Registered Riders</Text>
          <Group justify="space-between" mt={4}>
            <Text fw={800} size="xl" c="blue">{data?.total_riders ?? 0}</Text>
            <Badge color="blue" size="md">User Base</Badge>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">Verified customer accounts</Text>
        </Paper>
      </SimpleGrid>

      {/* Third Row: Payment Breakdown & Daily Trend */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Payment Channels */}
        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff" }}>
          <Text fw={700} size="sm" mb="xs">Payment Channel Breakdown</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(data?.payments ?? []).map((pay) => {
              const amount = Number(pay.total_paise) / 100;
              const share = totalPaymentPaise > 0 ? (Number(pay.total_paise) / totalPaymentPaise) * 100 : 0;
              return (
                <div key={pay.payment_method}>
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" fw={700} tt="uppercase">
                      {pay.payment_method} ({pay.count} rides)
                    </Text>
                    <Text size="xs" fw={700}>
                      ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({share.toFixed(1)}%)
                    </Text>
                  </Group>
                  <Progress
                    value={share}
                    size="sm"
                    color={pay.payment_method === "upi" ? "indigo" : pay.payment_method === "cash" ? "teal" : "violet"}
                  />
                </div>
              );
            })}
          </div>
        </Paper>

        {/* Daily Volume Trend */}
        <Paper p="md" withBorder style={{ borderRadius: 8, background: "#fff" }}>
          <Text fw={700} size="sm" mb="xs">14-Day Trip Volume</Text>
          <ResponsiveTable striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Bookings</Table.Th>
                <Table.Th>Completed</Table.Th>
                <Table.Th>Success %</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(!data?.volume || data.volume.length === 0) ? (
                <Table.Tr>
                  <Table.Td colSpan={4} style={{ textAlign: "center", color: "#94a3b8" }}>
                    No recent booking history.
                  </Table.Td>
                </Table.Tr>
              ) : (
                data.volume.slice(-7).map((vol) => {
                  const rate = vol.count > 0 ? ((vol.completed / vol.count) * 100).toFixed(0) : "0";
                  return (
                    <Table.Tr key={vol.day}>
                      <Table.Td>{vol.day}</Table.Td>
                      <Table.Td>{vol.count}</Table.Td>
                      <Table.Td>{vol.completed}</Table.Td>
                      <Table.Td>
                        <Badge color={Number(rate) >= 80 ? "green" : "orange"} size="xs">
                          {rate}%
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </ResponsiveTable>
        </Paper>
      </SimpleGrid>
    </div>
  );
}
