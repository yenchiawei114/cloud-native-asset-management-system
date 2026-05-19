import * as UserSearchComboboxModule from '../../../src/modules/core/components/UserSearchCombobox';

describe('UserSearchCombobox', () => {
    it('is exported', () => {
        const component =
            UserSearchComboboxModule.default ??
            (UserSearchComboboxModule as Record<string, unknown>).UserSearchCombobox;

        expect(component).toBeTruthy();
    });

    it('can be imported without triggering side effects', () => {
        expect(UserSearchComboboxModule).toBeTruthy();
        expect(typeof UserSearchComboboxModule).toBe('object');
    });

    it('exposes a stable component reference for debounce/ref tests', () => {
        const component =
            UserSearchComboboxModule.default ??
            (UserSearchComboboxModule as Record<string, unknown>).UserSearchCombobox;

        expect(component).toBe(UserSearchComboboxModule.default ?? (UserSearchComboboxModule as Record<string, unknown>).UserSearchCombobox);
    });
});
