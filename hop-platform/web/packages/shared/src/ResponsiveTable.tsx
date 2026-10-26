import { Children, isValidElement, type ReactNode } from "react";
import { Card, Stack, Table, type TableProps } from "@mantine/core";
import "./responsive.css";

type CellProps = { children?: ReactNode; colSpan?: number };
const childrenOf = (node: ReactNode): ReactNode[] =>
  isValidElement<CellProps>(node) ? Children.toArray(node.props.children) : [];

// Keep every field and action, but present each record as a labelled card on a phone.
export default function ResponsiveTable({ children, ...props }: TableProps) {
  const sections = Children.toArray(children);
  const head = sections.find(
    (node) => isValidElement(node) && node.type === Table.Thead,
  );
  const body = sections.find(
    (node) => isValidElement(node) && node.type === Table.Tbody,
  );
  const labels = childrenOf(childrenOf(head)[0]).map((node) =>
    isValidElement<CellProps>(node) ? node.props.children : null,
  );
  const rows = childrenOf(body);
  return (
    <>
      <div className="records-desktop">
        <Table.ScrollContainer minWidth={700}>
          <Table {...props}>{children}</Table>
        </Table.ScrollContainer>
      </div>
      <Stack className="records-mobile" gap="sm">
        {rows.map((row, index) => {
          const cells = childrenOf(row);
          if (
            cells.length === 1 &&
            isValidElement<CellProps>(cells[0]) &&
            cells[0].props.colSpan
          ) {
            return (
              <Card withBorder key={index}>
                {cells[0].props.children}
              </Card>
            );
          }
          return (
            <Card
              component="article"
              withBorder
              key={isValidElement(row) ? (row.key ?? index) : index}
              padding="md"
              radius="lg"
            >
              <dl className="record-fields">
                {cells.map((cell, i) => (
                  <div key={i}>
                    <dt>{labels[i] || "Actions"}</dt>
                    <dd>
                      {isValidElement<CellProps>(cell)
                        ? cell.props.children
                        : cell}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          );
        })}
      </Stack>
    </>
  );
}
