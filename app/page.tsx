import { redirect } from "next/navigation";

/* The control center is the app. */
export default function Home() {
  redirect("/control");
}
