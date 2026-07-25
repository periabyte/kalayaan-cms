import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useCurrentUser, useNeedsSetup, useSchema } from "./lib/hooks.js";
import { applyBrandColor } from "./lib/theme.js";
import { Layout } from "./components/Layout.js";
import { Login } from "./routes/Login.js";
import { AcceptInvite } from "./routes/AcceptInvite.js";
import { SetupScreen } from "./routes/SetupScreen.js";
import { CollectionBrowser } from "./routes/CollectionBrowser.js";
import { DocumentEditor } from "./routes/DocumentEditor.js";
import { SingletonEditor } from "./routes/SingletonEditor.js";
import { MediaLibrary } from "./routes/MediaLibrary.js";
import { Settings } from "./routes/Settings.js";

/**
 * The `/:collection` route: a singleton collection edits its one entry directly,
 * every other collection shows the list browser.
 */
function CollectionRoute() {
  const { collection = "" } = useParams();
  const { data: schema } = useSchema();
  const def = schema?.collections.find((c) => c.name === collection);
  if (schema && def?.singleton) return <SingletonEditor />;
  return <CollectionBrowser />;
}

export function App() {
  const { data: user, isLoading } = useCurrentUser();
  const { data: schema } = useSchema();
  const location = useLocation();
  // Only probe first-run status while unauthenticated.
  const { data: needsSetup, isLoading: setupLoading } = useNeedsSetup(!user);

  useEffect(() => applyBrandColor(schema?.ui.brandColor), [schema?.ui.brandColor]);

  if (isLoading) return null;
  if (!user) {
    // Accept-invite is a public screen: reachable while signed out, and the
    // pending user has no session until they set a password here.
    if (location.pathname === "/accept") return <AcceptInvite />;
    if (setupLoading) return null;
    // No admin exists yet → the one-time first-run screen; otherwise sign in.
    return needsSetup ? <SetupScreen /> : <Login />;
  }

  const firstCollection = schema?.collections[0]?.name;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={firstCollection ? <Navigate to={`/${firstCollection}`} replace /> : null} />
        <Route path="/media" element={<MediaLibrary />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/:collection" element={<CollectionRoute />} />
        <Route path="/:collection/:id" element={<DocumentEditor />} />
      </Route>
    </Routes>
  );
}
