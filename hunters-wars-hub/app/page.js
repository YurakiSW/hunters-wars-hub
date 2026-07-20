"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.replace("/login");
      if (d.user.status !== "approved") return router.replace("/pending");
      router.replace("/defs");
    });
  }, []);
  return null;
}
