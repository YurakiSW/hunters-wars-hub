import "./globals.css";
import CookieNotice from "../components/CookieNotice";
import Footer from "../components/Footer";
import AmbientSticker from "../components/AmbientSticker";
import StarrySky from "../components/StarrySky";
import KonamiCode from "../components/KonamiCode";
import TabTitleTease from "../components/TabTitleTease";
import ConsoleEasterEgg from "../components/ConsoleEasterEgg";

export const metadata = {
  title: "Hunters Wars — Counter Siege",
  description: "Hub di gilda per i counter di Guild Siege",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=Cinzel+Decorative:wght@700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <StarrySky />
        {children}
        <Footer />
        <CookieNotice />
        <AmbientSticker />
        <KonamiCode />
        <TabTitleTease />
        <ConsoleEasterEgg />
      </body>
    </html>
  );
}
