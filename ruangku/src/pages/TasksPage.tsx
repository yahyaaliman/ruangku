// Halaman Tugas lengkap: menyatukan tampilan dasar dengan paket tambahan
// (time tracking, rencana hari, otomasi, template) lewat slot.
import Tasks from "./Tasks";
import { useTimer } from "../lib/timer";
import { PlanDay, TimerButton, TrackedPanel, useWorkConfig } from "../tasks/TimeTracking";
import { useTasks } from "../lib/useTasks";
import { AutomationsPanel, TemplatesPanel } from "../tasks/Tools";

export default function TasksPage() {
  const timer = useTimer();
  const work = useWorkConfig();
  const { projects } = useTasks();
  return (
    <Tasks
      slots={{
        tracked: timer.tracked,
        capacity: work.capacity,
        timer: (t) => <TimerButton task={t} timer={timer} projects={projects} />,
        detailExtra: (t) => <TrackedPanel task={t} timer={timer} projects={projects} />,
        plan: (p) => <PlanDay {...p} clock={timer} work={work} />,
        renderSide: (kind, close, t) => (kind === "automations" ? <AutomationsPanel t={t} onClose={close} /> : <TemplatesPanel t={t} onClose={close} />),
      }}
    />
  );
}
