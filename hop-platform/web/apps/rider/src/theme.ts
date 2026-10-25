import { createTheme, type MantineColorsTuple } from "@mantine/core";

const hop: MantineColorsTuple = ["#fff1ed", "#ffdfd5", "#ffc0ad", "#f99d83", "#ee7d61", "#df644b", "#cc503d", "#b84333", "#96392e", "#7a322b"];

export const theme = createTheme({
  primaryColor: "hop",
  colors: { hop },
  primaryShade: 7,
  defaultRadius: "md",
  fontFamily: 'Inter, "SF Pro Text", system-ui, -apple-system, "Segoe UI", sans-serif',
  headings: { fontFamily: 'Inter, "SF Pro Text", system-ui, sans-serif', fontWeight: "700" },
  components: {
    Button: { defaultProps: { radius: "md", size: "sm" } },
    TextInput: { defaultProps: { radius: "md", size: "md" } },
    Select: { defaultProps: { radius: "md", size: "md" } },
    Textarea: { defaultProps: { radius: "md", size: "md" } },
    Paper: { defaultProps: { radius: "lg" } },
  },
});
