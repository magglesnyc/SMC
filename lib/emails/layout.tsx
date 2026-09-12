import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/** Branded wrapper for every outbound email. Change colours/wording here once. */
export function BrandedEmail({ preview, title, children }: { preview: string; title: string; children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#fbf7f0", fontFamily: "Georgia, 'Times New Roman', serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, maxWidth: 600, margin: "0 auto", padding: 32 }}>
          <Section style={{ borderBottom: "3px solid #c9a24d", paddingBottom: 12, marginBottom: 20 }}>
            <Text style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#7a2e3f" }}>♪ Senior Music Connection</Text>
            <Text style={{ margin: "2px 0 0", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#a5822f" }}>Live music, matched with care</Text>
          </Section>
          <Heading as="h1" style={{ fontSize: 22, color: "#2b2118", margin: "0 0 16px" }}>
            {title}
          </Heading>
          {children}
          <Hr style={{ borderColor: "#e5e0d6", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, color: "#7d7367", lineHeight: "18px", margin: 0 }}>
            Senior Music Connection matches professional musicians with senior living communities. Questions? Reply to this email and a member of our
            team will help.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const p = { fontSize: 15, lineHeight: "24px", color: "#2b2118", margin: "0 0 12px" } as const;
export const muted = { fontSize: 13, lineHeight: "20px", color: "#6b6258", margin: "0 0 8px" } as const;
export const button = {
  backgroundColor: "#7a2e3f",
  color: "#fbf7f0",
  borderRadius: 999,
  padding: "12px 20px",
  fontSize: 15,
  textDecoration: "none",
  display: "inline-block",
} as const;
