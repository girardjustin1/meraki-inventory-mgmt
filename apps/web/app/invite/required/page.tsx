import { SignInScreen } from "@/screens/sign-in/sign-in-screen";

/**
 * Where the proxy sends someone who is signed in with Google but has no profile: they have not
 * accepted an invite. Shows the "not invited" state with what to do next.
 */
export const metadata = { title: "You need an invite" };

export default function Page() {
    return <SignInScreen state="not-invited" />;
}
