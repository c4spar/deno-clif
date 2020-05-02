import { blue, dim, green, red } from 'https://deno.land/std@v0.41.0/fmt/colors.ts';
import { KeyEvent } from '../../keycode/mod.ts';
import { Figures } from '../lib/figures.ts';
import { GenericList, GenericListOption, GenericListOptions, GenericListOptionSettings, GenericListSettings } from '../lib/generic-list.ts';

export interface CheckboxOption extends GenericListOption {
    checked?: boolean;
    icon?: boolean;
}

export interface CheckboxOptionSettings extends GenericListOptionSettings {
    checked: boolean;
    icon: boolean;
}

export type CheckboxValueOptions = ( string | CheckboxOption )[];
export type CheckboxValueSettings = CheckboxOptionSettings[];

export interface CheckboxOptions extends GenericListOptions<string[], string[]> {
    check?: string;
    uncheck?: string;
    options: CheckboxValueOptions;
}

export interface CheckboxSettings extends GenericListSettings<string[], string[]> {
    check: string;
    uncheck: string;
    values: CheckboxValueSettings;
}

export class Checkbox extends GenericList<string[], string[], CheckboxSettings> {

    public static async prompt( options: CheckboxOptions ): Promise<string[] | undefined> {

        const items: CheckboxOption[] = this.mapValues( options.options );
        const values: CheckboxValueSettings = items.map( item => this.mapItem( item, options.default ) );

        return new this( {
            pointer: blue( Figures.POINTER_SMALL ),
            listPointer: blue( Figures.POINTER ),
            indent: ' ',
            maxRows: 10,
            check: green( Figures.TICK ),
            uncheck: red( Figures.CROSS ),
            ...options,
            values
        } ).prompt();
    }

    public static separator( label: string = '------------' ): CheckboxOption {
        return {
            ...super.separator(),
            icon: false
        };
    }

    protected static mapValues( optValues: CheckboxValueOptions ): CheckboxOption[] {
        return super.mapValues( optValues ) as CheckboxOption[];
    }

    protected static mapItem( item: CheckboxOption, defaults?: string[] ): CheckboxOptionSettings {
        return {
            ...super.mapItem( item ),
            checked: typeof item.checked === 'undefined' && defaults && defaults.indexOf( item.value ) !== -1 ? true : !!item.checked,
            icon: typeof item.icon === 'undefined' ? true : item.icon
        };
    }

    protected async handleEvent( event: KeyEvent ): Promise<boolean> {

        switch ( event.name ) {

            case 'c':
                // @TODO: implement Deno.Signal?: https://deno.land/std/manual.md#handle-os-signals
                if ( event.ctrl ) {
                    return Deno.exit( 0 );
                }
                break;

            case 'up':
                await this.selectPrevious();
                break;

            case 'down':
                await this.selectNext();
                break;

            case 'space':
                this.checkValue();
                break;

            case 'return':
            case 'enter':
                return this.selectValue();
        }

        return false;
    }

    protected checkValue() {
        const item = this.settings.values[ this.selected ];
        item.checked = !item.checked;
    }

    protected values() {
        return this.settings.values
                   .filter( item => item.checked )
                   .map( item => item.value );
    }

    protected async selectValue() {
        return this.validateValue( this.values() );
    }

    protected writeListItem( item: CheckboxOptionSettings, isSelected?: boolean ) {

        let line = this.settings.indent;

        // pointer
        line += isSelected ? `${ this.settings.listPointer } ` : '  ';

        // icon
        if ( item.icon ) {
            let check = item.checked ? `${ this.settings.check } ` : `${ this.settings.uncheck } `;
            if ( item.disabled ) {
                check = dim( check );
            }
            line += check;
        } else {
            line += '  ';
        }

        // value
        const value: string = item.name;
        line += `${ isSelected ? value : dim( value ) }`;

        this.writeLine( line );
    }

    protected transform( value: string[] ): string[] {
        return value;
    }

    protected validate( value: string[] ): boolean {
        return true;
    }

    protected format( value: string[] ): string {
        return value.join( ', ' );
    }
}
