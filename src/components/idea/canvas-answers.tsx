import { canvasSections, type IdeaCanvas } from "@/lib/canvas";

/** The answers of a CANVAS application, block by block, on the card's page and in the panel. */
export function CanvasAnswers({ canvas }: { canvas: IdeaCanvas }) {
  return (
    <div className="grid gap-5">
      {canvasSections(canvas).map((section) => (
        <div key={section.id} className="grid gap-2">
          <h3 className="text-[1.1rem] font-bold">{section.title}</h3>
          <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            {section.rows.map((row, index) => (
              <div key={index} className="contents">
                <dt className="font-bold">{row.label}</dt>
                <dd className="whitespace-pre-line">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
