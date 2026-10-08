import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bopz",
  description: "Swipe through videos and heart your favorites.",
  applicationName: "Bopz",
  appleWebApp: {
    capable: true,
    title: "Bopz",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/192", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/180", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

// iOS home-screen apps with a translucent status bar report 100vh/100dvh short by the
// status bar height, leaving a gap at the bottom. Measure the real height instead.
const APP_HEIGHT_SCRIPT = `(function(){
  var d=document.documentElement;
  function standalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
  function ios(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  function set(){
    var h=window.innerHeight;
    if(standalone()&&ios()){
      var portrait=matchMedia('(orientation: portrait)').matches;
      var sw=portrait?Math.min(screen.width,screen.height):Math.max(screen.width,screen.height);
      var sh=portrait?Math.max(screen.width,screen.height):Math.min(screen.width,screen.height);
      if(Math.abs(window.innerWidth-sw)<2)h=Math.max(h,sh);
    }
    d.style.setProperty('--app-height',h+'px');
  }
  set();
  addEventListener('resize',set);
  addEventListener('orientationchange',function(){setTimeout(set,250);});
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APP_HEIGHT_SCRIPT }} />
      </head>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
