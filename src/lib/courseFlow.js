function normalizedCourseNumber(value) {
  const parsed = Number(value || 1);
  if (!Number.isInteger(parsed)) return 1;
  return Math.max(1, Math.min(4, parsed));
}

function preparationTone(items) {
  const statuses = items.map((item) => item.preparationStatus || "pending");
  if (statuses.every((status) => status === "ready" || status === "served")) return "ready";
  if (statuses.some((status) => status === "in_progress")) return "in_progress";
  return "pending";
}

export function summarizeCourseFlow(items = []) {
  const groups = new Map();
  items
    .filter((item) => item?.status !== "voided")
    .forEach((item) => {
      const courseNumber = normalizedCourseNumber(item.courseNumber);
      const group = groups.get(courseNumber) || [];
      group.push(item);
      groups.set(courseNumber, group);
    });

  const courses = [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([courseNumber, courseItems]) => ({
      courseNumber,
      itemCount: courseItems.length,
      quantity: courseItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      released: courseItems.every((item) => Boolean(item.releasedAt)),
      status: preparationTone(courseItems),
    }));

  return {
    courses,
    nextHeldCourse: courses.find((course) => !course.released) || null,
    hasMultipleCourses: courses.length > 1,
  };
}
