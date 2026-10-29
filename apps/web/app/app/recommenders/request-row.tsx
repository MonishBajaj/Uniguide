import { LETTER_STATUSES } from "@/lib/recommendations";
import { removeRequest, updateRequest } from "./actions";

/** One letter: status and due date, editable in place. */
export function RequestRow({
  request,
  title,
}: {
  request: { id: string; status: string; due_on: string | null; asked_on: string | null; submitted_on: string | null };
  title: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm">
      <span className="font-semibold">{title}</span>
      <span className="flex flex-wrap items-center gap-2">
        <form action={updateRequest.bind(null, request.id)} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`st-${request.id}`}>Status for {title}</label>
          <select id={`st-${request.id}`} name="status" defaultValue={request.status} className="field py-1" style={{ width: "10rem" }}>
            {Object.entries(LETTER_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="sr-only" htmlFor={`due-${request.id}`}>Letter due for {title}</label>
          <input id={`due-${request.id}`} type="date" name="due_on" defaultValue={request.due_on ?? ""} className="field py-1" style={{ width: "10.5rem" }} />
          <button className="btn btn-secondary btn-sm">Update</button>
        </form>
        <form action={removeRequest.bind(null, request.id)}>
          <button className="btn btn-secondary btn-sm" aria-label={`Remove the letter for ${title}`}>Remove</button>
        </form>
      </span>
    </li>
  );
}
