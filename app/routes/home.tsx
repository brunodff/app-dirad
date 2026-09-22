import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { getUser } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  throw redirect(user ? '/painel' : '/login');
}

export default function Home() {
  return null;
}
