import { Mail, Phone, UserRound } from "lucide-react-native";
import { Linking, View } from "react-native";
import { CONTACT, contactLinks } from "@/lib/contact";
import { useTheme } from "@/lib/theme";
import { Eyebrow, Grid, Press, Txt } from "./ui";

const ITEMS = [
  { icon: UserRound, label: "Product owner", value: CONTACT.productOwner },
  { icon: Mail, label: "Email", value: CONTACT.email, href: contactLinks.email },
  { icon: Phone, label: "Mobile", value: CONTACT.phoneLabel, href: contactLinks.phone },
];

/** The product owner, email and mobile number, as a grid of tiles. */
export function ContactDetails() {
  const { c } = useTheme();
  return (
    <Grid cols={{ base: 1, sm: 2, lg: 3 }} gap={10}>
      {ITEMS.map(({ icon: IconC, label, value, href }) => {
        const body = (
          <>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}><IconC size={20} color={c.brand} /></View>
            <View style={{ flex: 1 }}>
              <Eyebrow>{label}</Eyebrow>
              <Txt size="sm" weight="semibold">{value}</Txt>
            </View>
          </>
        );
        const box = { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.background + "99", padding: 14 };
        return href ? (
          <Press key={label} onPress={() => Linking.openURL(href)} accessibilityLabel={`${label}: ${value}`} style={box}>{body}</Press>
        ) : (
          <View key={label} style={box}>{body}</View>
        );
      })}
    </Grid>
  );
}
