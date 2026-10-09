import { OwnerEditor } from "@/components/owner-editor";
export const metadata = { title: "Edit case" };
export default async function EditPage({ params }: { params: Promise<{ id: string }> }) { return <OwnerEditor id={(await params).id} />; }
