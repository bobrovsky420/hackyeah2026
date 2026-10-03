import { startTransition, type FormEvent } from "react";

/**
 * Sends a form to its action in a transition. A plain <form action>
 * makes React reset the form afterwards, and a reset puts a select back on
 * its first option even when it is controlled, so the saved status would
 * vanish from the screen. The submitter goes along, so the pressed button's
 * name and value reach the action.
 */
export function submitTo(dispatch: (form: FormData) => void, busy: boolean) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(form));
  };
}
