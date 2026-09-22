import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { getSession, destroySession } from '~/lib/session.server';

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  throw redirect('/login', {
    headers: { 'Set-Cookie': await destroySession(session) },
  });
}

export async function loader() {
  throw redirect('/login');
}
