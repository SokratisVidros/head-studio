export async function generateMetadata({ params }: { params: { slug: string } }) {
  return {
    title: params.slug,
  };
}

export default function Post() {
  return <article />;
}
