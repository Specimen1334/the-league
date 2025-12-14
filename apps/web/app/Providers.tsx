"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../lib/toast";

export function Providers(props: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{props.children}</AuthProvider>
    </ToastProvider>
  );
}
