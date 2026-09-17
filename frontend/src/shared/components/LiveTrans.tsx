import type { FlatNamespace, ParseKeys } from 'i18next';
import { Trans, useTranslation, type TransProps } from 'react-i18next';

type Props<Ns extends FlatNamespace> = Readonly<
  { ns: Ns } & Pick<TransProps<ParseKeys<Ns>, Ns>, 'i18nKey' | 'values'>
>;

/** Trans no se suscribe al idioma. Los avisos retenidos necesitan su propia suscripción. */
export function LiveTrans<Ns extends FlatNamespace>(props: Props<Ns>) {
  const { i18n } = useTranslation<Ns>(props.ns);
  return <Trans<ParseKeys<Ns>, Ns> {...props} i18n={i18n} />;
}
