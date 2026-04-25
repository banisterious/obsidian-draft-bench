import type DraftBenchPlugin from '../../main';
import { WelcomeModal } from '../ui/modals/welcome-modal';

/**
 * Register the "Draft Bench: Show welcome screen" command.
 *
 * Lets writers resurface the onboarding welcome modal after the
 * auto-show flag has been flipped. Useful for:
 *
 *   - Writers who dismissed the modal accidentally and want to revisit
 *     the CTAs (especially "Try with an example project").
 *   - Screenshot / documentation work.
 *   - Manual QA after a plugin update that changes onboarding copy.
 *
 * Opening the modal manually does not flip `settings.welcomeShown` —
 * the flag tracks "has the writer seen this once," not "has the writer
 * dismissed every showing." The flag is only flipped on `onClose` of an
 * auto-shown modal that hasn't already been seen, so re-opening
 * manually is idempotent w.r.t. the flag.
 */
export function registerShowWelcomeCommand(plugin: DraftBenchPlugin): void {
	plugin.addCommand({
		id: 'show-welcome',
		name: 'Show welcome screen',
		callback: () => {
			new WelcomeModal(plugin).open();
		},
	});
}
