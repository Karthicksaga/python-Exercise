import { createTheme, type MantineColorsTuple } from "@mantine/core";

const hop: MantineColorsTuple = ["#fff1ed", "#ffdfd5", "#ffc0ad", "#f99d83", "#ee7d61", "#df644b", "#cc503d", "#b84333", "#96392e", "#7a322b"];

export const theme = createTheme({
  breakpoints: { xs: "30em", sm: "51.3125em", md: "64em", lg: "75em", xl: "90em" },
  primaryColor: "hop",
  colors: { hop },
  primaryShade: 7,
  defaultRadius: "sm",
  fontFamily: 'Inter, "SF Pro Text", system-ui, -apple-system, "Segoe UI", sans-serif',
  headings: { fontFamily: 'Inter, "SF Pro Text", system-ui, sans-serif', fontWeight: "700" },
  components: {
    Button: { defaultProps: { radius: "md", size: "sm" } },
    TextInput: { defaultProps: { radius: "md", size: "sm" } },
    Select: { defaultProps: { radius: "md", size: "sm" } },
    Textarea: { defaultProps: { radius: "md", size: "sm" } },
    Paper: { defaultProps: { radius: "lg" } },
  },
});
