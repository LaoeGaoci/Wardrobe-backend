export function errorResponse(
  message: string,
  status: number,
): Response {
  return Response.json(
    {
      error: message,
    },
    {
      status,
    },
  );
}

export function successResponse(
  data: unknown,
  status = 200,
): Response {
  return Response.json(
    data,
    {
      status,
    },
  );
}