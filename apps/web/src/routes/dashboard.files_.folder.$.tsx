import { createFileRoute } from "@tanstack/react-router";
import { FilesPage } from "./dashboard.files";

// URL profesional ala file manager: /dashboard/files/folder/Windows/11
// "files_" (trailing underscore) = non-nested: tidak menempel sebagai child
// dari route /dashboard/files sehingga FilesPage tidak butuh <Outlet/>.
// Splat ($) menangkap seluruh sisa path termasuk "/" antar level folder.
export const Route = createFileRoute("/dashboard/files_/folder/$")({
  component: FilesFolderPage,
});

function FilesFolderPage() {
  const { _splat } = Route.useParams();
  return <FilesPage folderPath={_splat ?? ""} />;
}
