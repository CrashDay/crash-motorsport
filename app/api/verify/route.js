export async function POST() {
  return Response.json(
    {
      error:
        "Live verification is not enabled on the website deployment yet. This published dashboard includes the local tabs and static verification data, but on-demand verification still runs only in the premarket-ai workspace.",
    },
    { status: 501 },
  );
}
